import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import type { ComponentResult } from "@/lib/results/engine";

export async function GET(_: Request, ctx: RouteContext<"/results/[runId]/export">) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user.role, "/results")) return new Response("Forbidden", { status: 403 });
  const { runId } = await ctx.params;
  const run = await db.resultRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      courseResults: { include: { student: { include: { batch: true } }, enrolment: { include: { course: true } } } },
      semResults: true,
    },
  });
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = ["batch", "roll_no", "student", "course", "credits", "components", "raw_total", "grace", "total", "max", "grade", "grade_point", "status", "flags", "sgpa", "cgpa", "semester_result"];
  const lines = run.courseResults
    .sort((a, b) => a.student.rollNo.localeCompare(b.student.rollNo) || a.enrolment.course.code.localeCompare(b.enrolment.course.code))
    .map((c) => {
      const comps = c.components as unknown as ComponentResult[];
      const sr = run.semResults.find((s) => s.studentId === c.studentId);
      return [
        c.student.batch.code, c.student.rollNo, c.student.name, c.enrolment.course.code, c.credits,
        comps.map((x) => `${x.code}=${x.marks ?? "AB"}/${x.max}`).join("; "), c.rawTotal, c.grace, c.total, comps.reduce((a, x) => a + x.max, 0),
        c.grade, c.gradePoint, c.status, JSON.stringify(c.flags ?? []), sr?.sgpa, sr?.cgpa, sr?.result,
      ].map(esc).join(",");
    });
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="result-run-${runId}.csv"` },
  });
}
