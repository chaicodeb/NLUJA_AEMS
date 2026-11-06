import { getCurrentUser } from "@/lib/session";
import { IMPORT_KINDS, sampleCsv } from "@/lib/integrations/migration";
import { toCsv } from "@/lib/integrations/csv";

/** ?template=1 returns only the header row; otherwise a demo legacy export with deliberate problems. */
export async function GET(req: Request, ctx: RouteContext<"/api/integrations/sample/[kind]">) {
  const { kind } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !["ADMIN", "ACADEMIC_STAFF", "REGISTRAR"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  const spec = IMPORT_KINDS[kind.toUpperCase()];
  if (!spec) return new Response("Not found", { status: 404 });
  const template = new URL(req.url).searchParams.get("template");
  const body = template ? toCsv([spec.columns]) : await sampleCsv(kind.toUpperCase());
  const name = `${template ? "template" : "legacy-export"}-${kind.toLowerCase()}.csv`;
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
