import { db } from "../db";
import { audit } from "../audit";
import { UFM_CATEGORIES, UFM_PENALTIES } from "./ufm-shared";

type Actor = { id: string; role: string };

export async function examCases(examId: string) {
  const papers = await db.examPaper.findMany({ where: { examId }, include: { course: true } });
  const cases = await db.malpracticeCase.findMany({ where: { examPaperId: { in: papers.map((p) => p.id) } }, orderBy: { createdAt: "desc" } });
  const students = await db.student.findMany({ where: { id: { in: cases.map((c) => c.studentId) } } });
  return {
    papers,
    cases: cases.map((c) => ({ ...c, paper: papers.find((p) => p.id === c.examPaperId)!, student: students.find((s) => s.id === c.studentId)! })),
  };
}

export async function studentCases(studentId: string) {
  const cases = await db.malpracticeCase.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } });
  const papers = await db.examPaper.findMany({ where: { id: { in: cases.map((c) => c.examPaperId) } }, include: { course: true, exam: true } });
  return cases.map((c) => ({ ...c, paper: papers.find((p) => p.id === c.examPaperId)! }));
}

export async function reportCase(input: { examPaperId: string; rollNo: string; category: string; description: string; material: string; invigilator: string }, actor: Actor) {
  if (!["EXAM_STAFF", "COE"].includes(actor.role)) return { error: "Only the Examination Branch or the Controller of Examinations can record unfair-means reports." };
  if (!(input.category in UFM_CATEGORIES)) return { error: "Choose the kind of unfair means." };
  if (input.description.trim().length < 20) return { error: "Describe what the invigilator observed (at least a sentence)." };
  if (input.invigilator.trim().length < 3) return { error: "Name the invigilator who reported it." };
  const student = await db.student.findUnique({ where: { rollNo: input.rollNo.trim().toUpperCase() } });
  if (!student) return { error: "No student with that roll number." };
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: input.examPaperId }, include: { course: true } });
  const registered = await db.registrationPaper.findFirst({ where: { examPaperId: paper.id, registration: { studentId: student.id } } });
  if (!registered) return { error: `${student.name} is not registered for ${paper.course.code}.` };
  if (await db.malpracticeCase.findFirst({ where: { examPaperId: paper.id, studentId: student.id } })) return { error: "A case for this student and paper already exists." };
  const seat = await db.seatAllocation.findFirst({ where: { examPaperId: paper.id, studentId: student.id }, include: { room: true } });
  const c = await db.malpracticeCase.create({
    data: {
      examPaperId: paper.id, studentId: student.id, category: input.category, description: input.description.trim(), material: input.material.trim() || null,
      reportedBy: input.invigilator.trim(), reportedById: actor.id, room: seat ? `${seat.room.name}, bench ${seat.benchNo}` : null,
    },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "UFM_REPORTED", entity: "MalpracticeCase", entityId: c.id,
    summary: `Unfair means reported in ${paper.course.code}: ${student.name} (${student.rollNo}) — ${UFM_CATEGORIES[input.category]}; reported by ${input.invigilator.trim()}${seat ? ` in ${seat.room.name}` : ""}. Result of this paper withheld pending decision.`,
  });
  return { ok: true };
}

export async function scheduleHearing(caseId: string, at: string, committee: string, actor: Actor) {
  if (actor.role !== "COE") return { error: "Only the Controller of Examinations issues show-cause notices." };
  const c = await db.malpracticeCase.findUniqueOrThrow({ where: { id: caseId } });
  if (c.status === "DECIDED") return { error: "This case has been decided." };
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return { error: "Choose the date and time of the hearing." };
  if (committee.trim().length < 5) return { error: "Name the members of the Unfair Means Committee." };
  await db.malpracticeCase.update({ where: { id: caseId }, data: { status: "HEARING", hearingAt: when, committee: committee.trim() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "UFM_NOTICE_ISSUED", entity: "MalpracticeCase", entityId: caseId, summary: `Show-cause notice issued; hearing before ${committee.trim()} on ${when.toISOString()}. Student notified by SMS, e-mail and the portal.` });
  return { ok: true };
}

export async function submitExplanation(caseId: string, text: string, actor: Actor & { studentId: string | null }) {
  const c = await db.malpracticeCase.findUnique({ where: { id: caseId } });
  if (!c || c.studentId !== actor.studentId) return { error: "Case not found." };
  if (c.status === "DECIDED") return { error: "The committee has already decided this case." };
  if (text.trim().length < 20) return { error: "Write your explanation in a few sentences." };
  await db.malpracticeCase.update({ where: { id: caseId }, data: { explanation: text.trim(), explainedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "UFM_EXPLANATION_SUBMITTED", entity: "MalpracticeCase", entityId: caseId, summary: "Student submitted a written explanation to the Unfair Means Committee" });
  return { ok: true };
}

export async function decideCase(caseId: string, penalty: string, note: string, actor: Actor) {
  if (actor.role !== "COE") return { error: "Only the Controller of Examinations records the committee's decision." };
  const c = await db.malpracticeCase.findUniqueOrThrow({ where: { id: caseId } });
  if (c.status === "DECIDED") return { error: "This case has already been decided." };
  if (c.status !== "HEARING") return { error: "The student must be given a hearing (show-cause notice) before a decision." };
  if (!(penalty in UFM_PENALTIES)) return { error: "Choose the decision." };
  if (note.trim().length < 10) return { error: "Record the committee's reasons." };
  await db.malpracticeCase.update({ where: { id: caseId }, data: { status: "DECIDED", penalty, decisionNote: note.trim(), decidedById: actor.id, decidedAt: new Date() } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "UFM_DECIDED", entity: "MalpracticeCase", entityId: caseId,
    summary: `Unfair Means Committee decision: ${UFM_PENALTIES[penalty].label} — ${UFM_PENALTIES[penalty].effect}. Reasons: ${note.trim()}`,
    before: { status: c.status }, after: { status: "DECIDED", penalty },
  });
  return { ok: true };
}
