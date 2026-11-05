import { randomBytes } from "node:crypto";
import { db } from "../db";
import { audit } from "../audit";
import { computeEligibility } from "./eligibility";
import { LIVE_STUDENT_EMAIL } from "../demo/constants";

const OK = ["ELIGIBLE", "RELAXED"];

/** Everything a student needs to see on the registration screen for one exam. */
export async function getStudentExamView(studentId: string, examId: string) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: { include: { course: true } } } });
  const enrolments = await db.enrolment.findMany({
    where: { studentId, academicYear: exam.academicYear, status: "ACTIVE", courseId: { in: exam.papers.map((p) => p.courseId) } },
    include: { eligibilities: { where: { examId } }, attendance: true },
  });
  const missing = enrolments.filter((e) => e.eligibilities.length === 0).map((e) => e.id);
  if (missing.length) await computeEligibility(examId, undefined, missing);
  const elig = await db.eligibility.findMany({ where: { examId, enrolmentId: { in: enrolments.map((e) => e.id) } } });

  const registration = await db.examRegistration.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: { papers: true },
  });
  const seats = await db.seatAllocation.findMany({ where: { studentId, examPaper: { examId } }, include: { room: true } });
  const admitCard = registration ? await db.document.findFirst({ where: { type: "ADMIT_CARD", refId: registration.id, revoked: false }, orderBy: { issuedAt: "desc" } }) : null;

  const papers = exam.papers
    .filter((p) => enrolments.some((e) => e.courseId === p.courseId))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((p) => {
      const enrol = enrolments.find((e) => e.courseId === p.courseId)!;
      const e = elig.find((x) => x.enrolmentId === enrol.id);
      const seat = seats.find((s) => s.examPaperId === p.id);
      return {
        paperId: p.id,
        code: p.course.code,
        title: p.course.title,
        date: p.date,
        session: p.session,
        status: e?.status ?? "INELIGIBLE",
        reason: e?.reason ?? "Eligibility not determined",
        eligible: OK.includes(e?.status ?? ""),
        registered: !!registration?.papers.some((rp) => rp.examPaperId === p.id),
        seat: seat ? { room: seat.room.name, bench: seat.benchNo, centre: seat.room.centre } : null,
      };
    });
  return { exam, papers, registration, admitCard };
}

export async function registerStudent(studentId: string, examId: string, paperIds: string[], actor: { id: string; role: string }, paymentRef?: string) {
  const view = await getStudentExamView(studentId, examId);
  if (!view.exam.registrationOpen) return { error: "Registration for this examination is closed." };
  if (view.registration) return { error: "You have already registered for this examination." };
  if (!paperIds.length) return { error: "Select at least one paper." };

  const blocked = view.papers.filter((p) => paperIds.includes(p.paperId) && !p.eligible);
  if (blocked.length) {
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "REGISTRATION_BLOCKED", entity: "ExamRegistration",
      summary: `Registration blocked: ${blocked.map((b) => `${b.code} (${b.reason})`).join("; ")}`,
    });
    return { error: `Not eligible for ${blocked.map((b) => b.code).join(", ")}: ${blocked[0].reason}` };
  }

  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const reg = await db.examRegistration.create({
    data: {
      examId, studentId, status: "SUBMITTED", feePaid: true,
      paymentRef: paymentRef ?? `NLUJA-PG-${randomBytes(4).toString("hex").toUpperCase()}`,
      papers: { create: paperIds.map((examPaperId) => ({ examPaperId })) },
    },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "EXAM_REGISTERED", entity: "ExamRegistration", entityId: reg.id,
    summary: `${student.name} (${student.rollNo}) registered for ${paperIds.length} paper(s); fee ₹${view.exam.feeAmount} paid (${reg.paymentRef})`,
    after: { papers: view.papers.filter((p) => paperIds.includes(p.paperId)).map((p) => p.code), paymentRef: reg.paymentRef },
  });
  return { ok: true, registrationId: reg.id };
}

/** Demo helper: registers every student for all papers they are eligible for. */
export async function bulkRegisterEligible(examId: string, actor: { id: string; role: string }) {
  await computeEligibility(examId);
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: true } });
  const elig = await db.eligibility.findMany({ where: { examId, status: { in: OK } }, include: { enrolment: true } });
  const existing = await db.examRegistration.findMany({ where: { examId }, select: { studentId: true } });
  const liveStudent = await db.user.findUnique({ where: { email: LIVE_STUDENT_EMAIL }, select: { studentId: true } });
  const done = new Set([...existing.map((e) => e.studentId), ...(liveStudent?.studentId ? [liveStudent.studentId] : [])]);
  const byStudent = new Map<string, string[]>();
  for (const e of elig) {
    if (done.has(e.enrolment.studentId)) continue;
    const paper = exam.papers.find((p) => p.courseId === e.enrolment.courseId);
    if (!paper) continue;
    byStudent.set(e.enrolment.studentId, [...(byStudent.get(e.enrolment.studentId) ?? []), paper.id]);
  }
  for (const [studentId, paperIds] of byStudent) {
    await db.examRegistration.create({
      data: {
        examId, studentId, status: "SUBMITTED", feePaid: true, paymentRef: `NLUJA-PG-${randomBytes(4).toString("hex").toUpperCase()}`,
        papers: { create: paperIds.map((examPaperId) => ({ examPaperId })) },
      },
    });
  }
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "BULK_REGISTRATION", entity: "Exam", entityId: examId,
    summary: `Registered ${byStudent.size} students for their eligible papers (ineligible papers excluded automatically)`,
    after: { students: byStudent.size },
  });
  return { students: byStudent.size };
}
