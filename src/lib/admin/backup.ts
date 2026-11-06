import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "../db";
import { audit } from "../audit";

type Actor = { id: string; role: string };

export const POLICY = { scheduleHourIst: 2, retain: 14, rpoHours: 24, rtoHours: 8, format: "nluja-backup/1" };
/** Backup history must survive a restore, and Prisma's own bookkeeping is not application data. */
const EXCLUDED = ["_prisma_migrations", "BackupRun"];

let dirCache: string | null = null;
export async function backupDir() {
  if (dirCache) return dirCache;
  for (const dir of [process.env.BACKUP_DIR, path.join(process.cwd(), "backups"), path.join(tmpdir(), "nluja-backups")].filter((d): d is string => !!d)) {
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
      dirCache = dir;
      return dir;
    } catch {
      // not writable here (e.g. read-only container layer): try the next location
    }
  }
  throw new Error("No writable backup directory");
}

async function tableNames() {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name).filter((t) => !EXCLUDED.includes(t));
}

const quote = (t: string) => `"${t.replace(/"/g, '""')}"`;
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

export async function runBackup(kind: "SCHEDULED" | "MANUAL" | "PRE_RESTORE", actor: Actor | null, note?: string) {
  const started = new Date();
  const run = await db.backupRun.create({ data: { kind, createdById: actor?.id, note, startedAt: started } });
  try {
    const tables = await tableNames();
    const parts: string[] = [];
    let rows = 0;
    for (const t of tables) {
      const [{ j, n }] = await db.$queryRawUnsafe<{ j: string; n: bigint }[]>(`SELECT coalesce(json_agg(x), '[]'::json)::text AS j, count(*) AS n FROM ${quote(t)} x`);
      rows += Number(n);
      parts.push(`${JSON.stringify(t)}:${j}`);
    }
    const body = `{"format":${JSON.stringify(POLICY.format)},"createdAt":${JSON.stringify(started.toISOString())},"tables":{${parts.join(",")}}}`;
    const gz = gzipSync(Buffer.from(body, "utf8"), { level: 6 });
    const fileName = `nluja-${stamp(started)}-${kind.toLowerCase()}.json.gz`;
    await writeFile(path.join(await backupDir(), fileName), gz);
    const done = await db.backupRun.update({
      where: { id: run.id },
      data: { status: "OK", fileName, sizeBytes: gz.length, sha256: createHash("sha256").update(gz).digest("hex"), tables: tables.length, rows, durationMs: Date.now() - started.getTime(), finishedAt: new Date() },
    });
    await prune();
    await audit({ actorId: actor?.id ?? null, actorRole: actor?.role ?? "SYSTEM", action: "BACKUP_CREATED", entity: "BackupRun", entityId: run.id, summary: `${kind === "SCHEDULED" ? "Scheduled" : kind === "PRE_RESTORE" ? "Safety (pre-restore)" : "Manual"} backup: ${tables.length} tables, ${rows.toLocaleString("en-IN")} rows, ${(gz.length / 1024).toFixed(0)} KB, SHA-256 ${done.sha256!.slice(0, 12)}…` });
    return { ok: true, id: run.id, sizeBytes: gz.length, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.backupRun.update({ where: { id: run.id }, data: { status: "FAILED", error: msg.slice(0, 500), finishedAt: new Date(), durationMs: Date.now() - started.getTime() } });
    return { error: `Backup failed: ${msg}` };
  }
}

/** Keeps the newest POLICY.retain backups; older files are deleted and marked pruned. */
async function prune() {
  const ok = await db.backupRun.findMany({ where: { status: "OK" }, orderBy: { startedAt: "desc" } });
  for (const old of ok.slice(POLICY.retain)) {
    if (old.fileName) await unlink(path.join(await backupDir(), old.fileName)).catch(() => undefined);
    await db.backupRun.update({ where: { id: old.id }, data: { status: "PRUNED" } });
  }
}

async function load(id: string) {
  const run = await db.backupRun.findUnique({ where: { id } });
  if (!run || run.status !== "OK" || !run.fileName) return { error: "Backup not available." } as const;
  let gz: Buffer;
  try {
    gz = await readFile(path.join(await backupDir(), run.fileName));
  } catch {
    return { error: "The backup file is missing from the backup directory." } as const;
  }
  const sha = createHash("sha256").update(gz).digest("hex");
  if (sha !== run.sha256) return { error: `Checksum mismatch: file ${sha.slice(0, 12)}…, recorded ${run.sha256?.slice(0, 12)}… — the file has been altered or damaged.` } as const;
  const data = JSON.parse(gunzipSync(gz).toString("utf8")) as { format: string; createdAt: string; tables: Record<string, Record<string, unknown>[]> };
  if (data.format !== POLICY.format) return { error: `Unknown backup format ${data.format}.` } as const;
  return { run, gz, data } as const;
}

export async function verifyBackup(id: string, actor: Actor) {
  const r = await load(id);
  if ("error" in r) return { error: r.error };
  const rows = Object.values(r.data.tables).reduce((a, t) => a + t.length, 0);
  if (rows !== r.run.rows) return { error: `Row count mismatch: file has ${rows}, recorded ${r.run.rows}.` };
  const current = await tableNames();
  const missing = current.filter((t) => !(t in r.data.tables));
  await db.backupRun.update({ where: { id }, data: { verifiedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "BACKUP_VERIFIED", entity: "BackupRun", entityId: id, summary: `Backup ${r.run.fileName} verified: checksum matches, ${Object.keys(r.data.tables).length} tables, ${rows.toLocaleString("en-IN")} rows readable${missing.length ? `; ${missing.length} table(s) added since (${missing.join(", ")})` : ""}` });
  return { ok: true, tables: Object.keys(r.data.tables).length, rows, missing };
}

/** Replaces all application data with the backup's contents, after taking a safety backup of the current state. */
export async function restoreBackup(id: string, confirm: string, actor: Actor) {
  if (actor.role !== "ADMIN") return { error: "Only the System Administrator can restore." };
  if (confirm.trim() !== "RESTORE") return { error: 'Type RESTORE to confirm.' };
  const r = await load(id);
  if ("error" in r) return { error: r.error };
  const safety = await runBackup("PRE_RESTORE", actor, `Taken automatically before restoring ${r.run.fileName}`);
  if ("error" in safety) return { error: `Safety backup failed, restore not attempted: ${safety.error}` };
  const current = await tableNames();
  const started = Date.now();
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.$executeRawUnsafe(`TRUNCATE ${current.map(quote).join(", ")} RESTART IDENTITY CASCADE`);
      for (const t of current) {
        const rows = r.data.tables[t];
        if (!rows?.length) continue;
        await tx.$executeRawUnsafe(`INSERT INTO ${quote(t)} SELECT * FROM json_populate_recordset(NULL::${quote(t)}, $1::json)`, JSON.stringify(rows));
      }
      const serials = await tx.$queryRawUnsafe<{ t: string; c: string }[]>(
        `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`,
      );
      for (const s of serials.filter((x) => current.includes(x.t))) {
        await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${quote(s.t)}', '${s.c}'), coalesce((SELECT max(${quote(s.c)}) FROM ${quote(s.t)}), 0) + 1, false)`);
      }
    },
    { timeout: 180_000, maxWait: 20_000 },
  );
  await db.backupRun.update({ where: { id }, data: { restoredAt: new Date() } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "BACKUP_RESTORED", entity: "BackupRun", entityId: id,
    summary: `Database restored from ${r.run.fileName} (taken ${r.data.createdAt}) in ${((Date.now() - started) / 1000).toFixed(1)} s; the state before the restore is kept as a safety backup`,
  });
  return { ok: true, seconds: (Date.now() - started) / 1000 };
}

export async function backupFile(id: string) {
  const r = await load(id);
  if ("error" in r) return null;
  return { name: r.run.fileName!, bytes: r.gz };
}

export async function backupOverview() {
  const runs = await db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 });
  const users = await db.user.findMany({ where: { id: { in: runs.map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const lastOk = runs.find((r) => r.status === "OK");
  const dir = await backupDir();
  let diskBytes = 0;
  for (const f of await readdir(dir).catch(() => [] as string[])) if (f.endsWith(".json.gz")) diskBytes += (await stat(path.join(dir, f))).size;
  const ageHours = lastOk ? (Date.now() - lastOk.startedAt.getTime()) / 3600000 : null;
  return { runs: runs.map((r) => ({ ...r, by: users.find((u) => u.id === r.createdById)?.name ?? "Scheduler" })), lastOk, ageHours, dir, diskBytes, nextRun: nextScheduled() };
}

/** Next 02:00 IST. */
export function nextScheduled(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60000);
  const next = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), POLICY.scheduleHourIst, 0) - 330 * 60000);
  return next > now ? next : new Date(next.getTime() + 86400000);
}

/** Called hourly by the in-process scheduler: takes the nightly backup once per day after 02:00 IST. */
export async function scheduledTick(now = new Date()) {
  const lastSlot = new Date(nextScheduled(now).getTime() - 86400000);
  const done = await db.backupRun.findFirst({ where: { kind: "SCHEDULED", status: { in: ["OK", "PRUNED"] }, startedAt: { gte: lastSlot } } });
  if (done) return { skipped: true };
  return runBackup("SCHEDULED", null, "Nightly backup (02:00 IST)");
}

export async function clearBackupFiles() {
  const dir = await backupDir();
  for (const f of await readdir(dir).catch(() => [] as string[])) if (/^nluja-.*\.json\.gz$/.test(f)) await unlink(path.join(dir, f)).catch(() => undefined);
}
