import { db } from "@/lib/db";
import { auditFilter } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user.role, "/audit")) return new Response("Forbidden", { status: 403 });
  const rows = await db.auditLog.findMany({ where: auditFilter(Object.fromEntries(new URL(req.url).searchParams)), orderBy: { id: "asc" }, include: { actor: true } });
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["id", "timestamp", "actor", "role", "action", "entity", "entity_id", "summary", "before", "after", "prev_hash", "hash"].join(","),
    ...rows.map((r) =>
      [r.id, r.at.toISOString(), r.actor?.name, r.actorRole, r.action, r.entity, r.entityId, r.summary, JSON.stringify(r.before ?? ""), JSON.stringify(r.after ?? ""), r.prevHash, r.hash].map(esc).join(","),
    ),
  ].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="nluja-audit-trail.csv"` } });
}
