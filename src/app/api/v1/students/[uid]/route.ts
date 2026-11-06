import { db } from "@/lib/db";
import { ApiNotFound, apiHandler } from "@/lib/integrations/api";
import { studentView } from "@/lib/integrations/views";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/students/[uid]">) {
  const { uid } = await ctx.params;
  return apiHandler(req, "students:read", async () => {
    const s = await db.student.findUnique({ where: { uid }, include: { batch: { include: { programme: true } } } });
    if (!s) throw new ApiNotFound(`No student with University ID ${uid}.`);
    return studentView(s);
  });
}
