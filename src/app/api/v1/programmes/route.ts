import { db } from "@/lib/db";
import { apiHandler } from "@/lib/integrations/api";

export async function GET(req: Request) {
  return apiHandler(req, "catalogue:read", async () => {
    const programmes = await db.programme.findMany({
      orderBy: { code: "asc" },
      include: { curricula: { where: { status: "APPROVED" }, orderBy: { effectiveFrom: "asc" }, include: { courses: { orderBy: [{ semester: "asc" }, { code: "asc" }] } } } },
    });
    return {
      data: programmes.map((p) => ({
        code: p.code, name: p.name, level: p.level, semesters: p.durationSemesters, degree: p.degreeTitle,
        curricula: p.curricula.map((c) => ({
          code: c.code, name: c.name, effectiveFrom: c.effectiveFrom, effectiveTo: c.effectiveTo, totalCredits: c.totalCredits,
          courses: c.courses.map((x) => ({ code: x.code, title: x.title, semester: x.semester, credits: x.credits, category: x.category })),
        })),
      })),
    };
  });
}
