import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { decryptContent, loadPaper, qpRights } from "@/lib/exams/question-paper";
import { renderQuestionPaper } from "@/lib/pdf/question-paper";

export async function GET(_req: Request, ctx: RouteContext<"/api/question-papers/[id]/pdf">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const p = await loadPaper(id);
  if (!p?.questionPaper) return new Response("Not found", { status: 404 });
  const rights = qpRights(user, p, new Date());
  if (!canAccess(user.role, "/question-papers") || !rights.viewContent) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "QuestionPaper", entityId: p.questionPaper.id, summary: `Attempt to download the ${p.course.code} question paper refused` });
    return new Response("Forbidden — question papers are confidential until released", { status: 403 });
  }
  const qp = p.questionPaper;
  const released = qp.status === "RELEASED";
  const entry = await audit({
    actorId: user.id, actorRole: user.role, action: released ? "QP_PRINTED" : "QP_PREVIEWED", entity: "QuestionPaper", entityId: qp.id,
    summary: released ? `${p.course.code} question paper downloaded for printing by ${user.name}` : `${p.course.code} draft preview (watermarked, version ${qp.version}) generated for ${user.name}`,
  });
  const at = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const programme = await db.course.findUnique({ where: { id: p.courseId }, include: { curriculumVersion: { include: { programme: true } } } });
  const pdf = await renderQuestionPaper({
    examName: p.exam.name, code: p.course.code, title: p.course.title, programme: programme?.curriculumVersion.programme.name ?? "",
    date: p.date, session: p.session, durationMins: p.durationMins, maxMarks: p.maxMarks, content: decryptContent(qp.body),
    watermark: released ? undefined : `DRAFT v${qp.version} — NOT FOR DISTRIBUTION`,
    footer: `${released ? "Confidential — printed" : "Preview"} for ${user.name} (${user.role}) on ${at} IST · audit #${entry.id} · fingerprint ${qp.contentHash.slice(0, 16)}`,
  });
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${p.course.code}-question-paper${released ? "" : "-DRAFT"}.pdf"`, "Cache-Control": "no-store" },
  });
}
