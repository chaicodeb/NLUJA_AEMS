import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { backupFile } from "@/lib/admin/backup";

export async function GET(_: Request, ctx: RouteContext<"/api/admin/backup/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const file = await backupFile(id);
  if (!file) return new Response("Backup not available or failed its checksum", { status: 404 });
  await audit({ actorId: user.id, actorRole: user.role, action: "BACKUP_DOWNLOADED", entity: "BackupRun", entityId: id, summary: `Backup ${file.name} downloaded for off-site storage` });
  return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${file.name}"` } });
}
