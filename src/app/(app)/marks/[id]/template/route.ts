import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { buildTemplate } from "@/lib/marks/internal";

export async function GET(_: Request, ctx: RouteContext<"/marks/[id]/template">) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user.role, "/marks")) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (user.role === "FACULTY") {
    const sheet = await db.internalMarksSheet.findUnique({ where: { id }, include: { course: true } });
    if (sheet?.course.facultyId !== user.id) return new Response("Forbidden", { status: 403 });
  }
  const file = await buildTemplate(id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}
