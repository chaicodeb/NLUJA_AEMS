import { db } from "../db";
import { audit } from "../audit";
import { issueDocument } from "../docs";
import { publishedSemesters, type Flag } from "./engine";

export type GradeSheetPayload = {
  exam: { code: string; name: string };
  student: { name: string; rollNo: string; uid: string; abcId: string | null; programme: string; batch: string };
  semester: number;
  courses: { code: string; title: string; credits: number; grade: string; gradePoint: number; status: string; total: number; max: number }[];
  credits: number;
  earnedCredits: number;
  sgpa: number;
  cgpa: number;
  result: string;
  division: string | null;
  history: { semester: number; sgpa: number; credits: number }[];
  publishedOn: string;
  revision?: { note: string; on: string; supersedes: string };
};

/** Second-person verification: the person who processed a result can never approve it. */
export async function approveRun(runId: string, actor: { id: string; role: string }) {
  const run = await db.resultRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "PROCESSED") return { error: `Run is ${run.status.toLowerCase()} — only processed runs can be approved.` };
  if (run.processedById === actor.id) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "SEGREGATION_VIOLATION_BLOCKED", entity: "ResultRun", entityId: runId, summary: "Attempt to approve a result run processed by the same user was blocked" });
    return { error: "Segregation of duties: you processed this result run, so another authorised officer must approve it." };
  }
  await db.resultRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "RESULTS_APPROVED", entity: "ResultRun", entityId: runId, summary: "Result run verified and approved for publication", before: { status: "PROCESSED" }, after: { status: "APPROVED" } });
  return { ok: true };
}

export async function buildGradeSheetPayload(semResultId: string): Promise<GradeSheetPayload> {
  const sr = await db.semesterResult.findUniqueOrThrow({
    where: { id: semResultId },
    include: { run: { include: { exam: true } }, student: { include: { batch: { include: { programme: true } } } } },
  });
  const [history, courseResults] = await Promise.all([
    publishedSemesters(sr.studentId, sr.semester),
    db.courseResult.findMany({ where: { runId: sr.runId, studentId: sr.studentId }, include: { enrolment: { include: { course: true } } } }),
  ]);
  const courses = courseResults
    .sort((a, b) => a.enrolment.course.code.localeCompare(b.enrolment.course.code))
    .map((c) => ({
      code: c.enrolment.course.code, title: c.enrolment.course.title, credits: c.credits, grade: c.grade, gradePoint: c.gradePoint,
      status: c.status, total: c.total, max: (c.components as { max: number }[]).reduce((a, x) => a + x.max, 0),
    }));
  return {
    exam: { code: sr.run.exam.code, name: sr.run.exam.name },
    student: {
      name: sr.student.name, rollNo: sr.student.rollNo, uid: sr.student.uid, abcId: sr.student.abcId,
      programme: sr.student.batch.programme.name, batch: sr.student.batch.name,
    },
    semester: sr.semester, courses, credits: sr.credits, earnedCredits: sr.earnedCredits, sgpa: sr.sgpa, cgpa: sr.cgpa,
    result: sr.result, division: sr.division, history: history.map((h) => ({ semester: h.semester, sgpa: h.sgpa, credits: h.credits })),
    publishedOn: new Date().toISOString(),
  };
}

export async function publishRun(runId: string, actor: { id: string; role: string }) {
  const run = await db.resultRun.findUniqueOrThrow({ where: { id: runId }, include: { semResults: true } });
  if (run.status !== "APPROVED") return { error: "Results must be approved before publication." };

  let issued = 0;
  for (const sr of run.semResults) {
    if (sr.result === "WITHHELD") continue;
    const payload = await buildGradeSheetPayload(sr.id);
    await issueDocument({ type: "GRADE_SHEET", studentId: sr.studentId, refId: sr.id, payload, issuedById: actor.id });
    issued++;
  }
  await db.resultRun.update({ where: { id: runId }, data: { status: "PUBLISHED", publishedById: actor.id, publishedAt: new Date() } });
  await db.exam.update({ where: { id: run.examId }, data: { status: "CLOSED" } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "RESULTS_PUBLISHED", entity: "ResultRun", entityId: runId,
    summary: `Results published: ${issued} digitally signed grade sheets issued; students and parents notified by SMS/e-mail; ready for DigiLocker/NAD upload`,
    before: { status: "APPROVED" }, after: { status: "PUBLISHED", gradeSheets: issued },
  });
  return { ok: true, issued };
}

/** Issues a revised grade sheet for an amended published result and marks the earlier one as superseded. */
export async function reissueGradeSheet(semResultId: string, note: string, actor: { id: string; role: string }) {
  const previous = await db.document.findFirst({ where: { type: "GRADE_SHEET", refId: semResultId, revoked: false }, orderBy: { issuedAt: "desc" } });
  const payload = await buildGradeSheetPayload(semResultId);
  payload.revision = { note, on: new Date().toISOString(), supersedes: previous?.verifyCode ?? "—" };
  if (previous) await db.document.update({ where: { id: previous.id }, data: { revoked: true } });
  const sr = await db.semesterResult.findUniqueOrThrow({ where: { id: semResultId } });
  return issueDocument({ type: "GRADE_SHEET", studentId: sr.studentId, refId: semResultId, payload, issuedById: actor.id });
}

export function flagsOf(v: unknown): Flag[] {
  return Array.isArray(v) ? (v as Flag[]) : [];
}
