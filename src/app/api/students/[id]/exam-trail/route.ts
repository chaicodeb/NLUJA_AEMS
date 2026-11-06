import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { studentExamTrail, studentExams } from "@/lib/exams/trail";
import { toCsv } from "@/lib/integrations/csv";

export async function GET(req: Request, ctx: RouteContext<"/api/students/[id]/exam-trail">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!canAccess(user.role, "/students")) return new Response("Forbidden", { status: 403 });
  const exams = await studentExams(id);
  const examId = new URL(req.url).searchParams.get("exam") ?? exams[0]?.id;
  if (!examId) return new Response("No examination", { status: 404 });
  const t = await studentExamTrail(id, examId, { showEvaluators: ["COE", "EXAM_STAFF", "ADMIN", "VC"].includes(user.role) });
  await audit({ actorId: user.id, actorRole: user.role, action: "EXAM_TRAIL_EXPORTED", entity: "Student", entityId: id, summary: `Examination trail of ${t.student.name} (${t.exam.code}) exported — ${t.events.length} events` });
  const csv = toCsv([
    [`Examination trail — ${t.student.name} (${t.student.rollNo}) — ${t.exam.name}`],
    [`Audit chain ${t.chain.ok ? `verified (${t.chain.total} entries)` : `BROKEN at #${t.chain.brokenAt}`} · exported ${new Date().toISOString()} by ${user.name}`],
    [],
    ["Phase", "When (IST)", "Stage", "Event", "Detail", "Source", "Audit #", "Actor", "Hash"],
    ...t.events.map((e) => [
      e.phase, e.at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), e.stage, e.title, e.detail, e.source === "audit" ? (e.scope === "exam" ? "Audit (whole exam)" : "Audit") : "Record",
      e.audit?.id ?? "", e.audit?.actor ?? "", e.audit?.hash ?? "",
    ]),
  ]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="exam-trail-${t.student.rollNo}-${t.exam.code}.csv"` } });
}
