import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { stableStringify } from "./utils";

type Tx = Prisma.TransactionClient | PrismaClient;

export type AuditInput = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

const GENESIS = "0".repeat(64);

export function computeAuditHash(prevHash: string, at: Date, e: AuditInput) {
  const body = stableStringify({
    at: at.toISOString(),
    actorId: e.actorId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  });
  return createHash("sha256").update(prevHash + body).digest("hex");
}

/** Appends a hash-chained audit entry. Call inside the same transaction as the change. */
export async function audit(entry: AuditInput, tx: Tx = db) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7331)`;
  const last = await tx.auditLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS;
  const at = new Date();
  const hash = computeAuditHash(prevHash, at, entry);
  return tx.auditLog.create({
    data: {
      at,
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      prevHash,
      hash,
    },
  });
}

/** Recomputes the whole chain; returns the first broken entry id, if any. */
export async function verifyAuditChain() {
  const rows = await db.auditLog.findMany({ orderBy: { id: "asc" } });
  let prev = GENESIS;
  for (const r of rows) {
    const expected = computeAuditHash(prev, r.at, {
      actorId: r.actorId,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
    });
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false as const, brokenAt: r.id, total: rows.length };
    prev = r.hash;
  }
  return { ok: true as const, total: rows.length };
}
