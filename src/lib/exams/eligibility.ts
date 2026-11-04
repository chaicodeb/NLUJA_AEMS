import type { RuleSet } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { asParams, evaluateAttendance, type AttendanceParams } from "../rules/engine";
import { getActiveRule } from "../rules/store";

export type EligibilitySummary = { total: number; ELIGIBLE: number; INELIGIBLE: number; PENDING_RELAXATION: number; RELAXED: number };

/** Re-evaluates eligibility for every enrolment examined in this exam, using the active attendance rule of each programme. */
export async function computeEligibility(examId: string, actor?: { id: string; role: string }, onlyEnrolmentIds?: string[]) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: true } });
  const courseIds = exam.papers.map((p) => p.courseId);

  const enrolments = await db.enrolment.findMany({
    where: { courseId: { in: courseIds }, academicYear: exam.academicYear, status: "ACTIVE", ...(onlyEnrolmentIds ? { id: { in: onlyEnrolmentIds } } : {}) },
    include: { attendance: true, student: { include: { batch: true } } },
  });

  const studentIds = Array.from(new Set(enrolments.map((e) => e.studentId)));
  const allEnrolments = await db.enrolment.findMany({
    where: { studentId: { in: studentIds }, academicYear: exam.academicYear, status: "ACTIVE" },
    include: { attendance: true },
  });
  const aggregate = new Map<string, number>();
  for (const sid of studentIds) {
    const mine = allEnrolments.filter((e) => e.studentId === sid);
    const held = mine.reduce((a, e) => a + (e.attendance?.classesHeld ?? 0), 0);
    const att = mine.reduce((a, e) => a + (e.attendance?.classesAttended ?? 0), 0);
    aggregate.set(sid, held ? (att / held) * 100 : 0);
  }

  const relaxations = await db.relaxationRequest.findMany({ where: { examId, enrolmentId: { in: enrolments.map((e) => e.id) } }, orderBy: { createdAt: "desc" } });
  const ruleCache = new Map<string, RuleSet | null>();

  const summary: EligibilitySummary = { total: 0, ELIGIBLE: 0, INELIGIBLE: 0, PENDING_RELAXATION: 0, RELAXED: 0 };
  for (const e of enrolments) {
    const progId = e.student.batch.programmeId;
    if (!ruleCache.has(progId)) ruleCache.set(progId, await getActiveRule("ATTENDANCE", progId));
    const rule = ruleCache.get(progId);
    if (!rule) continue;
    const latest = relaxations.find((r) => r.enrolmentId === e.id);
    const coursePct = e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0;
    const aggregatePct = aggregate.get(e.studentId) ?? 0;
    const result = evaluateAttendance(asParams<AttendanceParams>(rule), {
      coursePct,
      aggregatePct,
      relaxationApproved: latest?.status === "APPROVED",
      relaxationPending: latest?.status === "PENDING",
    });
    await db.eligibility.upsert({
      where: { examId_enrolmentId: { examId, enrolmentId: e.id } },
      create: { examId, enrolmentId: e.id, status: result.status, relaxable: result.relaxable, reason: result.reason, coursePct, aggregatePct, ruleSetId: rule.id, ruleVersion: rule.version },
      update: { status: result.status, relaxable: result.relaxable, reason: result.reason, coursePct, aggregatePct, ruleSetId: rule.id, ruleVersion: rule.version, computedAt: new Date() },
    });
    summary.total++;
    summary[result.status]++;
  }

  if (actor && !onlyEnrolmentIds) {
    await audit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "RUN_ELIGIBILITY",
      entity: "Exam",
      entityId: examId,
      summary: `Eligibility computed for ${summary.total} course registrations: ${summary.ELIGIBLE} eligible, ${summary.INELIGIBLE} ineligible, ${summary.PENDING_RELAXATION} pending relaxation, ${summary.RELAXED} relaxed`,
      after: summary,
    });
  }
  return summary;
}
