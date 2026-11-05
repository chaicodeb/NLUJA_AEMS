import { db } from "../db";
import { seedDemo } from "./seed";
import { DEMO_LIVE_CLASS, DEMO_MARKS_SHEET, DEMO_SUPPLEMENTARY, DEMO_TOUGH_PAPER, DEMO_VERIFY_SHEET, LIVE_STUDENT_EMAIL } from "./constants";
import { biometricPunches, decideLeave, markSession } from "../attendance/daily";
import { loadSheet, saveSheetDraft, submitSheet, verifySheet } from "../marks/internal";
import { computeEligibility } from "../exams/eligibility";
import { bulkRegisterEligible, getStudentExamView, registerStudent } from "../exams/registration";
import { generateSeating } from "../exams/seating";
import { publishAdmitCards } from "../exams/admit-cards";
import { conductExam, submitEvaluation, type QuestionScheme } from "../exams/evaluation";
import { processResults } from "../results/engine";
import { approveRun, publishRun } from "../results/workflow";
import { applyRevaluation } from "../results/revaluation";
import { decideModeration, proposeModeration } from "../results/moderation";
import { createSupplementaryExam, registerSupplementary, supplementaryOptions } from "../results/supplementary";

export const DEMO_STAGES = [
  { key: "start", label: "Fresh start", hint: "Rules configured; eligibility not yet run; one relaxation request pending; two internal-marks sheets open; today's Taxation class unmarked; one duty leave pending" },
  { key: "eligibility", label: "Eligibility decided", hint: "Internal marks verified and attendance closed; eligibility computed and the VC has approved Priyanka's relaxation" },
  { key: "registered", label: "Students registered", hint: "Everyone except Aditi has registered — she registers live" },
  { key: "admit", label: "Admit cards published", hint: "Aditi registered, seating generated, admit cards issued" },
  { key: "conducted", label: "Exam conducted", hint: "Scripts scanned; 3 evaluations left for the live evaluator demo" },
  { key: "evaluated", label: "Evaluation complete", hint: "All scripts finalised; BL3.4 Economics flagged for moderation; ready for result processing" },
  { key: "processed", label: "Results processed", hint: "Processed by the Exam Branch; awaiting COE approval" },
  { key: "published", label: "Results published", hint: "Approved by COE, released by VC, grade sheets issued" },
  { key: "revaluation", label: "Revaluation window", hint: "Sneha has applied for revaluation of ML1.3 (awaiting a re-evaluator); Tenzing's scrutiny awaits the COE" },
  { key: "supplementary", label: "Supplementary exam", hint: "Backlog/improvement exam created; Lalrinpuii (absent) and Sourav (improvement) registered; Arindam registers live" },
] as const;

export type DemoStage = (typeof DEMO_STAGES)[number]["key"];

/** What the teacher and the Dean do live in the internal-marks act. */
async function completeDemoMarksSheets() {
  const hod = await db.user.findFirstOrThrow({ where: { role: "HOD" } });
  for (const d of [DEMO_MARKS_SHEET, DEMO_VERIFY_SHEET]) {
    const sheet = await db.internalMarksSheet.findFirstOrThrow({ where: { course: { code: d.course }, component: { code: d.component } }, include: { course: true } });
    const teacher = { id: sheet.course.facultyId!, role: "FACULTY" };
    if (sheet.status === "DRAFT") {
      const { rows } = (await loadSheet(sheet.id))!;
      await saveSheetDraft(sheet.id, rows.map((r) => ({ enrolmentId: r.enrolmentId, absent: r.absent, detail: r.detail, marks: r.marks ?? DEMO_MARKS_SHEET.pending[r.rollNo] ?? null })), teacher);
      await submitSheet(sheet.id, teacher);
    }
    await verifySheet(sheet.id, { id: hod.id, role: "HOD" });
  }
}

/** What the teacher and the Dean do live in the daily-attendance act. */
async function completeDemoAttendance() {
  const live = await db.classSession.findFirst({ where: { course: { code: DEMO_LIVE_CLASS.course }, status: "SCHEDULED" }, include: { course: true } });
  if (live) {
    const punches = await biometricPunches(live.id);
    if ("punches" in punches && punches.punches) {
      await markSession(live.id, punches.punches.map((p) => ({ enrolmentId: p.enrolmentId, status: p.status })), { id: live.course.facultyId!, role: "FACULTY" }, "BIOMETRIC");
    }
  }
  const hod = await db.user.findFirstOrThrow({ where: { role: "HOD" } });
  for (const leave of await db.leaveRequest.findMany({ where: { status: "PENDING" } })) {
    await decideLeave(leave.id, true, "Participation certificate verified.", { id: hod.id, role: "HOD" });
  }
}

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

  await completeDemoMarksSheets();
  await completeDemoAttendance();

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

  const tough = await db.examPaper.findFirst({ where: { examId: exam.id, course: { code: DEMO_TOUGH_PAPER.course } } });
  if (tough) {
    await proposeModeration(exam.id, tough.id, DEMO_TOUGH_PAPER.delta, MODERATION_REASON, as(coe));
    const proposal = await db.moderationAction.findFirst({ where: { examPaperId: tough.id, status: "PROPOSED" } });
    if (proposal) await decideModeration(proposal.id, true, "Approved on the Moderation Board's recommendation.", as(vc));
  }
  const res = await processResults(exam.id, as(staff));
  if ("error" in res || !at("published")) return;
  await approveRun(res.runId, as(coe));
  await publishRun(res.runId, as(vc));
  if (!at("revaluation")) return;

  const scriptOf = async (name: string, code: string) => {
    const s = await db.student.findFirstOrThrow({ where: { name } });
    const script = await db.answerScript.findFirstOrThrow({ where: { studentId: s.id, examPaper: { examId: exam.id, course: { code } } } });
    const user = await db.user.findFirst({ where: { studentId: s.id } });
    return { studentId: s.id, scriptId: script.id, actor: user ? as(user) : as(staff) };
  };
  const sneha = await scriptOf("Sneha Iyer", "ML1.3");
  await applyRevaluation(sneha.studentId, sneha.scriptId, "REVALUATION", "I answered all questions in detail; Written marks appear lower than expected.", "UPI", sneha.actor);
  const tenzing = await scriptOf("Tenzing Bhutia", "BL9.2");
  await applyRevaluation(tenzing.studentId, tenzing.scriptId, "SCRUTINY", "Requesting re-totalling of Taxation paper.", "NETBANKING", tenzing.actor);
  if (!at("supplementary")) return;

  const sup = await createSupplementaryExam(as(coe));
  if (!("examId" in sup) || !sup.examId) return;
  for (const [name, code] of DEMO_SUPPLEMENTARY.preRegistered) {
    const s = await db.student.findFirstOrThrow({ where: { name } });
    const opts = await supplementaryOptions(s.id, sup.examId);
    const paper = opts?.options.find((o) => o.code === code && o.kind);
    if (paper) await registerSupplementary(s.id, sup.examId, [paper.paperId], "COUNTER", as(staff));
  }
}

const MODERATION_REASON = "Paper-setter's report and the board's review confirm Q3 and Q5 exceeded the syllabus depth; marks are uniformly below the batch's other papers.";
