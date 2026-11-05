import { db } from "../db";
import { seedDemo } from "./seed";
import { LIVE_STUDENT_EMAIL } from "./constants";
import { computeEligibility } from "../exams/eligibility";
import { bulkRegisterEligible, getStudentExamView, registerStudent } from "../exams/registration";
import { generateSeating } from "../exams/seating";
import { publishAdmitCards } from "../exams/admit-cards";
import { conductExam, submitEvaluation, type QuestionScheme } from "../exams/evaluation";
import { processResults } from "../results/engine";
import { approveRun, publishRun } from "../results/workflow";

export const DEMO_STAGES = [
  { key: "start", label: "Fresh start", hint: "Rules configured; eligibility not yet run; one relaxation request pending" },
  { key: "eligibility", label: "Eligibility decided", hint: "Eligibility computed and the VC has approved Priyanka's relaxation" },
  { key: "registered", label: "Students registered", hint: "Everyone except Aditi has registered — she registers live" },
  { key: "admit", label: "Admit cards published", hint: "Aditi registered, seating generated, admit cards issued" },
  { key: "conducted", label: "Exam conducted", hint: "Scripts scanned; 3 evaluations left for the live evaluator demo" },
  { key: "evaluated", label: "Evaluation complete", hint: "All scripts finalised; ready for result processing" },
  { key: "processed", label: "Results processed", hint: "Processed by the Exam Branch; awaiting COE approval" },
  { key: "published", label: "Results published", hint: "Approved by COE, released by VC, grade sheets issued" },
] as const;

export type DemoStage = (typeof DEMO_STAGES)[number]["key"];

/** Rebuilds the demo from scratch and replays the real workflow up to the requested stage. */
export async function jumpToStage(stage: DemoStage) {
  const target = DEMO_STAGES.findIndex((s) => s.key === stage);
  await seedDemo();
  const at = (k: DemoStage) => target >= DEMO_STAGES.findIndex((s) => s.key === k);
  if (!at("eligibility")) return;

  const [coe, vc, staff] = await Promise.all([
    db.user.findFirstOrThrow({ where: { role: "COE" } }),
    db.user.findFirstOrThrow({ where: { role: "VC" } }),
    db.user.findFirstOrThrow({ where: { role: "EXAM_STAFF" } }),
  ]);
  const exam = await db.exam.findFirstOrThrow({ where: { code: "ESE-ODD-2026" } });
  const as = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });

  await computeEligibility(exam.id, as(coe));
  const pending = await db.relaxationRequest.findMany({ where: { status: "PENDING" } });
  for (const r of pending) {
    await db.relaxationRequest.update({ where: { id: r.id }, data: { status: "APPROVED", decidedById: vc.id, decidedAt: new Date(), decisionNote: "Approved on medical grounds; discharge summary verified." } });
    await computeEligibility(exam.id, undefined, [r.enrolmentId]);
  }
  if (!at("registered")) return;

  await bulkRegisterEligible(exam.id, as(staff));
  if (!at("admit")) return;

  const live = await db.user.findUniqueOrThrow({ where: { email: LIVE_STUDENT_EMAIL } });
  const view = await getStudentExamView(live.studentId!, exam.id);
  await registerStudent(live.studentId!, exam.id, view.papers.filter((p) => p.eligible).map((p) => p.paperId), as(live), "UPI-7F3A21C9");
  await generateSeating(exam.id, as(staff), 20261123);
  await publishAdmitCards(exam.id, as(coe));
  if (!at("conducted")) return;

  await conductExam(exam.id, as(staff));
  if (!at("evaluated")) return;

  const open = await db.evaluation.findMany({ where: { status: { not: "LOCKED" } }, include: { script: { include: { examPaper: true, evaluations: true } } } });
  for (const ev of open) {
    const scheme = (ev.script.examPaper.questionScheme as QuestionScheme) ?? [];
    const earlier = ev.script.evaluations.find((e) => e.status === "LOCKED")?.marks as { questions: Record<string, number> } | undefined;
    const questions = earlier?.questions ?? Object.fromEntries(scheme.map((q, i) => [q.q, Math.min(q.max, Math.round(q.max * (0.72 - i * 0.02)))]));
    await submitEvaluation(ev.id, { questions, annotations: [] }, "", { id: ev.evaluatorId, role: "EVALUATOR" }, true);
  }
  if (!at("processed")) return;

  const res = await processResults(exam.id, as(staff));
  if ("error" in res || !at("published")) return;
  await approveRun(res.runId, as(coe));
  await publishRun(res.runId, as(vc));
}
