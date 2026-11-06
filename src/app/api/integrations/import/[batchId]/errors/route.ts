import { getCurrentUser } from "@/lib/session";
import { errorReport } from "@/lib/integrations/migration";

export async function GET(_: Request, ctx: RouteContext<"/api/integrations/import/[batchId]/errors">) {
  const { batchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !["ADMIN", "ACADEMIC_STAFF", "REGISTRAR"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  return new Response(await errorReport(batchId), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${batchId.slice(-6)}-errors.csv"` } });
}
