import { getCurrentUser } from "@/lib/session";
import { VIEWER_ROLES, exportCsv } from "@/lib/feedback/feedback";

export async function GET(_: Request, ctx: RouteContext<"/feedback/[formId]/export">) {
  const user = await getCurrentUser();
  if (!user || !VIEWER_ROLES.includes(user.role)) return new Response("Forbidden", { status: 403 });
  const { formId } = await ctx.params;
  const { filename, body } = await exportCsv(formId);
  return new Response("\uFEFF" + body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
}
