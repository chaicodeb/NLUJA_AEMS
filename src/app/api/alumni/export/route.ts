import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { alumniCsv } from "@/lib/alumni/alumni";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!canAccess(user.role, "/alumni")) return new Response("Forbidden", { status: 403 });
  const csv = await alumniCsv();
  await audit({ actorId: user.id, actorRole: user.role, action: "ALUMNI_EXPORTED", entity: "AlumniProfile", summary: "Alumni progression data exported (NAAC 5.2)" });
  return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="alumni-progression.csv"' } });
}
