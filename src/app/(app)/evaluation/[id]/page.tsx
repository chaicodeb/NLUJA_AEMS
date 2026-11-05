import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import bwipjs from "bwip-js/node";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePage } from "@/lib/session";
import { answerText } from "@/lib/demo/answers";
import { REVALUATION_ROUND, type EvaluationMarks, type QuestionScheme } from "@/lib/exams/evaluation";
import { Workspace } from "./workspace";

export default async function EvaluatePage({ params }: PageProps<"/evaluation/[id]">) {
  const user = await requirePage("/evaluation");
  const { id } = await params;
  const ev = await db.evaluation.findUnique({
    where: { id },
    select: {
      id: true, evaluatorId: true, round: true, status: true, marks: true, total: true, remarks: true, submittedAt: true, signatureHash: true,
      script: {
        select: {
          id: true, dummyNo: true, barcode: true, pageCount: true,
          examPaper: { select: { maxMarks: true, questionScheme: true, evaluationMode: true, date: true, exam: { select: { name: true } }, course: { select: { code: true, title: true } } } },
          _count: { select: { evaluations: true } },
        },
      },
    },
  });
  if (!ev) notFound();
  if (ev.evaluatorId !== user.id) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "Evaluation", entityId: id, summary: `Attempted to open script ${ev.script.dummyNo} allocated to another evaluator` });
    redirect(`/forbidden?path=${encodeURIComponent(`/evaluation/${id}`)}`);
  }

  const queue = await db.evaluation.findMany({ where: { evaluatorId: user.id, status: { not: "LOCKED" } }, select: { id: true }, orderBy: { script: { dummyNo: "asc" } } });
  const next = queue.find((q) => q.id !== id)?.id ?? null;
  const barcodeSvg = bwipjs.toSVG({ bcid: "code128", text: ev.script.barcode, height: 8, includetext: false });
  const scheme = (ev.script.examPaper.questionScheme as QuestionScheme) ?? [];
  const answers = scheme.map((_, i) => answerText(ev.script.examPaper.course.code, i));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <Link href="/evaluation" className="text-brand-700 hover:underline">← My evaluations</Link>
        <span className="text-muted-foreground">{queue.length} script(s) pending in your queue</span>
      </div>
      <Workspace
        evaluation={{
          id: ev.id, round: ev.round, revaluation: ev.round === REVALUATION_ROUND, status: ev.status, total: ev.total, remarks: ev.remarks ?? "", signatureHash: ev.signatureHash,
          submittedAt: ev.submittedAt?.toISOString() ?? null,
          marks: (ev.marks as EvaluationMarks | null) ?? { questions: {}, annotations: [] },
        }}
        script={{
          dummyNo: ev.script.dummyNo, barcode: ev.script.barcode, pageCount: ev.script.pageCount, barcodeSvg,
          courseCode: ev.script.examPaper.course.code, courseTitle: ev.script.examPaper.course.title, examName: ev.script.examPaper.exam.name,
          maxMarks: ev.script.examPaper.maxMarks, scheme, answers, evaluationMode: ev.script.examPaper.evaluationMode,
        }}
        nextId={next}
      />
    </div>
  );
}
