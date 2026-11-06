import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { sectionByCode } from "@/lib/reports/statutory";
import { toCsv } from "@/lib/integrations/csv";

export async function GET(_: Request, ctx: RouteContext<"/api/reports/statutory/[code]">) {
  const { code } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!canAccess(user.role, "/reports/statutory")) return new Response("Forbidden", { status: 403 });
  const found = await sectionByCode(code);
  if (!found) return new Response("Not found", { status: 404 });
  const { report, section } = found;
  await audit({ actorId: user.id, actorRole: user.role, action: "STATUTORY_EXPORT", entity: "Report", entityId: code, summary: `${report.body} ${section.title} exported (${report.period})` });
  const body = toCsv([[`${report.title} — ${section.title}`], [report.period], [], section.columns, ...section.rows, ...(section.note ? [[], [`Note: ${section.note}`]] : [])]);
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${code.toLowerCase()}.csv"` } });
}
