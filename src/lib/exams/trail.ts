import { db } from "../db";
import { verifyAuditChain } from "../audit";
import { UFM_CATEGORIES, UFM_PENALTIES } from "./ufm-shared";

export type TrailEvent = {
  at: Date;
  stage: "Access" | "Attendance" | "Eligibility" | "Registration" | "Seating" | "Exam hall" | "Custody" | "Evaluation" | "Result" | "Document" | "Post-result";
  title: string;
  detail: string;
  source: "audit" | "record";
  audit?: { id: number; action: string; hash: string; actor: string | null };
  scope?: "student" | "exam";
  phase: TrailPhase;
};

export const PHASES = ["Before the examination", "In the examination hall", "Script custody & evaluation", "Result & documents", "Logins & access to this record"] as const;
export type TrailPhase = (typeof PHASES)[number];

function phaseOf(e: Omit<TrailEvent, "phase">): TrailPhase {
  switch (e.stage) {
    case "Attendance": case "Eligibility": case "Registration": case "Seating": return PHASES[0];
    case "Exam hall": return PHASES[1];
    case "Custody": case "Evaluation": return PHASES[2];
    case "Result": case "Post-result": return PHASES[3];
    case "Document": return /admit card/i.test(e.title) ? PHASES[0] : PHASES[3];
    default: return PHASES[4];
  }
}

const STAGE_OF: Record<string, TrailEvent["stage"]> = {
  LOGIN: "Access", LOGIN_FAILED: "Access", MFA_FAILED: "Access", ACCESS_DENIED: "Access",
  ATTENDANCE_ALERT: "Attendance", LEAVE_APPLIED: "Attendance", LEAVE_DECIDED: "Attendance",
  EXAM_TRAIL_EXPORTED: "Access", EXAM_PLANNED: "Registration", TIMETABLE_PUBLISHED: "Registration",
  ELIGIBILITY_RUN: "Eligibility", RUN_ELIGIBILITY: "Eligibility", CREATE_EXAM: "Registration", BULK_REGISTRATION: "Registration", RELAXATION_REQUESTED: "Eligibility", RELAXATION_APPROVED: "Eligibility", RELAXATION_REJECTED: "Eligibility",
  EXAM_REGISTERED: "Registration", REGISTRATION_BLOCKED: "Registration", SUPPLEMENTARY_REGISTERED: "Registration",
  SEATING_GENERATED: "Seating", ADMIT_CARDS_PUBLISHED: "Seating", ADMIT_CARD_DOWNLOADED: "Document",
  HALL_ATTENDANCE_RECORDED: "Exam hall", EXAM_CONDUCTED: "Exam hall", QP_RELEASED: "Exam hall",
  UFM_REPORTED: "Exam hall", UFM_NOTICE_ISSUED: "Post-result", UFM_EXPLANATION_SUBMITTED: "Post-result", UFM_DECIDED: "Post-result",
  EVALUATIONS_SIMULATED: "Evaluation", EVALUATION_LOCKED: "Evaluation", EVALUATION_REOPENED: "Evaluation", EVALUATOR_REASSIGNED: "Evaluation", LOCKED_EDIT_REJECTED: "Evaluation", MODERATION_PROPOSED: "Result", MODERATION_APPROVED: "Result",
  RESULTS_PROCESSED: "Result", RESULTS_APPROVED: "Result", RESULTS_PUBLISHED: "Result",
  GRADE_SHEET_DOWNLOADED: "Document", REVALUATION_APPLIED: "Post-result", REVALUATOR_ASSIGNED: "Post-result", REVALUATION_DECIDED: "Post-result",
};

const TITLES: Record<string, string> = {
  QP_RELEASED: "Question paper released",
  UFM_REPORTED: "Unfair-means report recorded",
  UFM_NOTICE_ISSUED: "Show-cause notice issued",
  UFM_EXPLANATION_SUBMITTED: "Student's explanation received",
  UFM_DECIDED: "Unfair Means Committee decision",
};

/** Exams a student registered for (newest first). */
export async function studentExams(studentId: string) {
  return db.exam.findMany({ where: { registrations: { some: { studentId } } }, orderBy: { startDate: "desc" } });
}

/**
 * Everything the system knows about one student in one examination, grouped by phase and in time order within each phase:
 * hash-chained audit entries (the student's own actions, actions about the student, and exam-wide steps)
 * merged with the operational records (eligibility, seat, hall check-in, script custody, evaluation, result, documents).
 */
export async function studentExamTrail(studentId: string, examId: string, opts: { showEvaluators: boolean }) {
  const [student, exam] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: true, user: true } }),
    db.exam.findUniqueOrThrow({ where: { id: examId } }),
  ]);
  const [registration, eligibility, seats, scripts, relaxations, revals, docs, runs, examPapers] = await Promise.all([
    db.examRegistration.findUnique({ where: { examId_studentId: { examId, studentId } }, include: { papers: { include: { examPaper: { include: { course: true } } } } } }),
    db.eligibility.findMany({ where: { examId, enrolment: { studentId } }, include: { enrolment: { include: { course: true } } } }),
    db.seatAllocation.findMany({ where: { studentId, examPaper: { examId } }, include: { room: true, examPaper: { include: { course: true } } } }),
    db.answerScript.findMany({ where: { studentId, examPaper: { examId } }, include: { examPaper: { include: { course: true } }, custody: { orderBy: { at: "asc" } }, evaluations: { include: { evaluator: true }, orderBy: { round: "asc" } } } }),
    db.relaxationRequest.findMany({ where: { studentId, examId } }),
    db.revaluationRequest.findMany({ where: { studentId, examId } }),
    db.document.findMany({ where: { studentId }, orderBy: { issuedAt: "asc" } }),
    db.resultRun.findMany({ where: { examId }, include: { courseResults: { where: { studentId }, include: { enrolment: { include: { course: true } } } } } }),
    db.examPaper.findMany({ where: { examId }, select: { id: true, course: { select: { code: true } } } }),
  ]);
  const examPaperCodes = new Map(examPapers.map((p) => [p.id, p.course.code]));
  const malpractice = await db.malpracticeCase.findMany({ where: { studentId, examPaperId: { in: examPapers.map((p) => p.id) } } });
  const paperIds = seats.map((s) => s.examPaperId);
  const ids = [studentId, registration?.id, ...malpractice.map((m) => m.id), ...docs.map((d) => d.id), ...relaxations.map((r) => r.id), ...revals.map((r) => r.id), ...scripts.flatMap((s) => s.evaluations.map((e) => e.id))].filter((x): x is string => !!x);
  const from = new Date(exam.startDate.getTime() - 120 * 86400000);
  const qpIds = (await db.questionPaper.findMany({ where: { examPaperId: { in: paperIds } }, select: { id: true } })).map((q) => q.id);
  const [own, about, examWide] = await Promise.all([
    student.user ? db.auditLog.findMany({ where: { actorId: student.user.id, at: { gte: from } }, include: { actor: true } }) : [],
    db.auditLog.findMany({ where: { entityId: { in: ids } }, include: { actor: true } }),
    db.auditLog.findMany({ where: { OR: [{ entity: "Exam", entityId: examId }, { entity: "ResultRun", entityId: { in: runs.map((r) => r.id) } }, { entity: "ExamPaper", entityId: { in: paperIds } }, { entity: "QuestionPaper", entityId: { in: qpIds }, action: "QP_RELEASED" }] }, include: { actor: true } }),
  ]);

  const events: Omit<TrailEvent, "phase">[] = [];
  const seen = new Set<number>();
  for (const [list, scope] of [[own, "student"], [about, "student"], [examWide, "exam"]] as const) {
    for (const a of list) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      events.push({
        at: a.at, stage: STAGE_OF[a.action] ?? (scope === "exam" ? "Result" : "Access"),
        title: TITLES[a.action] ?? a.action.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        detail: a.summary ?? "", source: "audit", scope, audit: { id: a.id, action: a.action, hash: a.hash, actor: a.actor ? `${a.actor.name} (${a.actorRole ?? a.actor.role})` : "System" },
      });
    }
  }

  for (const e of eligibility) {
    events.push({ at: e.computedAt, stage: "Eligibility", source: "record", title: `${e.enrolment.course.code}: ${e.status.replaceAll("_", " ").toLowerCase()}`, detail: `Course attendance ${e.coursePct.toFixed(1)}%, aggregate ${e.aggregatePct.toFixed(1)}%${e.reason ? ` — ${e.reason}` : ""}${e.ruleVersion ? ` (rule v${e.ruleVersion})` : ""}` });
  }
  for (const r of relaxations) {
    events.push({ at: r.createdAt, stage: "Eligibility", source: "record", title: `Relaxation request — ${r.status.toLowerCase()}`, detail: `${r.ground.toLowerCase()} grounds${r.decisionNote ? `; decision: ${r.decisionNote}` : ""}` });
  }
  if (registration) {
    events.push({
      at: registration.submittedAt, stage: "Registration", source: "record", title: "Registration on record",
      detail: `${registration.papers.map((p) => `${p.examPaper.course.code}${p.kind !== "REGULAR" ? ` (${p.kind.toLowerCase()})` : ""}`).join(", ")} · fee ${registration.feePaid ? `paid (${registration.paymentRef})` : "unpaid"}${registration.admitCardCode ? ` · admit card ${registration.admitCardCode}` : ""}`,
    });
  }
  for (const s of seats) {
    const start = s.examPaper.date;
    events.push({ at: new Date(start.getTime() - 30 * 60000), stage: "Seating", source: "record", title: `${s.examPaper.course.code}: seat allotted`, detail: `${s.room.name}, bench ${s.benchNo} · ${s.examPaper.session === "FN" ? "Forenoon" : "Afternoon"} session` });
    if (s.attended === true) events.push({ at: s.checkedInAt ?? start, stage: "Exam hall", source: "record", title: `${s.examPaper.course.code}: present`, detail: `Checked in by ${s.markedBy ?? "invigilator"} · answer booklet ${s.bookletNo ?? "—"} · admit card and identity verified` });
    if (s.attended === false) events.push({ at: start, stage: "Exam hall", source: "record", title: `${s.examPaper.course.code}: absent`, detail: `Marked absent by ${s.markedBy ?? "invigilator"}` });
  }
  for (const m of malpractice) {
    const code = examPaperCodes.get(m.examPaperId) ?? "";
    events.push({ at: m.createdAt, stage: "Exam hall", source: "record", title: `${code}: unfair-means report`, detail: `${UFM_CATEGORIES[m.category] ?? m.category} — ${m.description} · reported by ${m.reportedBy}${m.material ? ` · seized: ${m.material}` : ""}` });
    if (m.hearingAt) events.push({ at: m.hearingAt, stage: "Post-result", source: "record", title: `${code}: hearing before the Unfair Means Committee`, detail: `${m.committee ?? ""}${m.explanation ? ` · student's explanation on record` : ""}` });
    if (m.decidedAt && m.penalty) events.push({ at: m.decidedAt, stage: "Post-result", source: "record", title: `${code}: committee decision — ${UFM_PENALTIES[m.penalty]?.label ?? m.penalty}`, detail: `${UFM_PENALTIES[m.penalty]?.effect ?? ""} · ${m.decisionNote ?? ""}` });
  }
  for (const sc of scripts) {
    const code = sc.examPaper.course.code;
    for (const c of sc.custody) events.push({ at: c.at, stage: "Custody", source: "record", title: `${code}: ${c.action.replaceAll("_", " ").toLowerCase()}`, detail: `${c.location} · ${c.handler}${c.action === "BARCODED_MASKED" ? ` · dummy no. ${sc.dummyNo}` : ""}` });
    sc.evaluations.forEach((e) => {
      const who = opts.showEvaluators ? e.evaluator.name : `Evaluator ${e.round}`;
      events.push({
        at: e.submittedAt ?? e.createdAt, stage: "Evaluation", source: "record",
        title: `${code}: round ${e.round} ${e.status === "LOCKED" ? "evaluated & signed" : e.status.toLowerCase()}`,
        detail: `${who} saw dummy no. ${sc.dummyNo} only${e.total != null ? ` · ${e.total} / ${sc.examPaper.maxMarks}` : ""}${e.signatureHash ? ` · signature ${e.signatureHash.slice(0, 10)}…` : ""}`,
      });
    });
    if (sc.finalMarks != null) events.push({ at: sc.evaluations.at(-1)?.submittedAt ?? sc.examPaper.date, stage: "Evaluation", source: "record", title: `${code}: script finalised`, detail: `Final end-semester mark ${sc.finalMarks} / ${sc.examPaper.maxMarks}` });
  }
  for (const r of runs) {
    for (const c of r.courseResults) {
      events.push({ at: r.publishedAt ?? r.processedAt, stage: "Result", source: "record", title: `${c.enrolment.course.code}: ${c.grade} (${c.status})`, detail: `${r.label} · ${r.status.toLowerCase()} · total ${c.total}${c.grace ? `, grace +${c.grace}` : ""}` });
    }
  }
  for (const d of docs.filter((x) => x.issuedAt >= from)) {
    events.push({ at: d.issuedAt, stage: "Document", source: "record", title: `${d.type.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())} issued`, detail: `Verification code ${d.verifyCode}${d.revoked ? " · revoked / replaced" : ""}` });
  }

  const phased: TrailEvent[] = events.map((e) => ({ ...e, phase: phaseOf(e) }));
  phased.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.at.getTime() - b.at.getTime() || (a.source === "audit" ? 1 : -1));
  const firstPaper = seats.length ? Math.min(...seats.map((s) => s.examPaper.date.getTime())) : exam.startDate.getTime();
  const fastForwarded = phased.some((e) => e.source === "audit" && e.phase === PHASES[3] && e.at.getTime() < firstPaper);
  const chain = await verifyAuditChain();
  return {
    student, exam, events: phased, chain, fastForwarded,
    counts: { audit: phased.filter((e) => e.source === "audit").length, records: phased.filter((e) => e.source === "record").length },
  };
}
