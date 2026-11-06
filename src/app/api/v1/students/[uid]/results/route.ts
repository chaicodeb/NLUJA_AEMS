import { db } from "@/lib/db";
import { ApiNotFound, apiHandler } from "@/lib/integrations/api";
import { PUBLISHED_ORDER, firstPerSemester } from "@/lib/results/engine";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/students/[uid]/results">) {
  const { uid } = await ctx.params;
  return apiHandler(req, "results:read", async () => {
    const s = await db.student.findUnique({
      where: { uid },
      include: {
        semResults: { where: { run: { status: "PUBLISHED" } }, orderBy: PUBLISHED_ORDER, include: { run: true } },
        courseResults: { where: { run: { status: "PUBLISHED" } }, include: { enrolment: { include: { course: true } } } },
      },
    });
    if (!s) throw new ApiNotFound(`No student with University ID ${uid}.`);
    const sems = firstPerSemester(s.semResults);
    return {
      uid: s.uid, rollNo: s.rollNo, name: s.name,
      cgpa: sems.at(-1)?.cgpa ?? null,
      semesters: sems.map((r) => ({
        semester: r.semester, sgpa: r.sgpa, cgpa: r.cgpa, credits: r.credits, earnedCredits: r.earnedCredits, result: r.result, division: r.division, publishedAt: r.run.publishedAt,
        source: r.run.label,
        courses: s.courseResults
          .filter((c) => c.runId === r.runId && c.enrolment.semester === r.semester)
          .map((c) => ({ code: c.enrolment.course.code, title: c.enrolment.course.title, credits: c.credits, grade: c.grade, gradePoint: c.gradePoint, status: c.status })),
      })),
    };
  });
}
