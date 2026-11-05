import { createHash } from "node:crypto";
import { db } from "../db";
import { audit } from "../audit";
import type { AttendanceParams } from "../rules/engine";
import { asParams } from "../rules/engine";
import { getActiveRule } from "../rules/store";
import { attendanceMarks } from "../demo/scenarios";
import { DEMO_LIVE_CLASS } from "../demo/constants";
import { countsAsPresent, istDate, istDay, istTime, levelFor, type AlertLevel } from "./shared";

type Actor = { id: string; role: string };
export type MarkInput = { enrolmentId: string; status: string };

const STATUSES = ["PRESENT", "ABSENT", "DUTY_LEAVE", "MEDICAL_LEAVE"];
const CORRECTOR_ROLES = ["ACADEMIC_STAFF", "COE"];

export async function attendanceRule(programmeId: string) {
  const rule = await getActiveRule("ATTENDANCE", programmeId);
  return rule ? asParams<AttendanceParams>(rule) : null;
}

export async function loadSession(id: string) {
  const session = await db.classSession.findUnique({
    where: { id },
    include: { course: { include: { faculty: true, curriculumVersion: true } }, records: true },
  });
  if (!session) return null;
  const enrolments = await db.enrolment.findMany({
    where: { courseId: session.courseId, academicYear: session.academicYear, status: "ACTIVE" },
    include: { student: { include: { batch: true } }, attendance: true },
    orderBy: { student: { rollNo: "asc" } },
  });
  const day = istDay(session.startsAt);
  const leaves = await db.leaveRequest.findMany({
    where: { studentId: { in: enrolments.map((e) => e.studentId) }, status: "APPROVED", fromDate: { lte: session.startsAt }, toDate: { gte: session.startsAt } },
  });
  const rows = enrolments.map((e) => {
    const rec = session.records.find((r) => r.enrolmentId === e.id);
    const leave = leaves.find((l) => l.studentId === e.studentId);
    return {
      enrolmentId: e.id, studentId: e.studentId, rollNo: e.student.rollNo, name: e.student.name,
      status: rec?.status ?? (leave ? (leave.type === "MEDICAL" ? "MEDICAL_LEAVE" : "DUTY_LEAVE") : "PRESENT"),
      leave: leave ? `${leave.type === "MEDICAL" ? "Medical" : "Duty"} leave approved` : null,
      held: e.attendance?.classesHeld ?? 0, attended: e.attendance?.classesAttended ?? 0,
    };
  });
  const programmeId = enrolments[0]?.student.batch.programmeId;
  return { session, rows, day, rule: programmeId ? await attendanceRule(programmeId) : null };
}

/** Simulated punch log from the classroom biometric reader (production: device API / CSV export). */
export async function biometricPunches(sessionId: string) {
  const loaded = await loadSession(sessionId);
  if (!loaded) return { error: "Class not found." };
  const { session, rows } = loaded;
  const demo = session.course.code === DEMO_LIVE_CLASS.course && session.status === "SCHEDULED";
  const punches = rows.map((r) => {
    const h = createHash("sha256").update(session.id + r.enrolmentId).digest()[0];
    const absent = demo ? DEMO_LIVE_CLASS.absent.includes(r.rollNo) : h < 20;
    const at = new Date(session.startsAt.getTime() - 4 * 60000 + (h % 9) * 60000);
    return { enrolmentId: r.enrolmentId, status: absent ? (r.status.endsWith("LEAVE") ? r.status : "ABSENT") : "PRESENT", punchedAt: absent ? null : istTime(at) };
  });
  return { ok: true, device: "Academic Block · Lecture Hall 2 · reader BIO-AB-LH2", punches };
}

async function recompute(enrolmentIds: string[]) {
  const records = await db.attendanceRecord.findMany({ where: { enrolmentId: { in: enrolmentIds }, session: { status: "MARKED" } }, select: { enrolmentId: true, status: true } });
  const out = new Map<string, { held: number; attended: number; medical: number }>();
  for (const id of enrolmentIds) out.set(id, { held: 0, attended: 0, medical: 0 });
  for (const r of records) {
    const s = out.get(r.enrolmentId)!;
    s.held++;
    if (countsAsPresent(r.status)) s.attended++;
    if (r.status === "MEDICAL_LEAVE") s.medical++;
  }
  for (const [enrolmentId, s] of out) {
    await db.attendanceSummary.upsert({
      where: { enrolmentId },
      create: { enrolmentId, classesHeld: s.held, classesAttended: s.attended, medicalLeaveDays: s.medical, biometricCount: s.attended },
      update: { classesHeld: s.held, classesAttended: s.attended, medicalLeaveDays: s.medical, biometricCount: s.attended },
    });
    const system = await db.markEntry.findFirst({ where: { enrolmentId, component: { source: "SYSTEM" } } });
    if (system && s.held) await db.markEntry.update({ where: { id: system.id }, data: { marks: attendanceMarks((s.attended / s.held) * 100) } });
  }
  return out;
}

/** Sends an alert when a student's course attendance newly drops into a worse band (warning → shortage → below relaxation floor). */
async function raiseAlerts(
  changes: { enrolmentId: string; studentId: string; code: string; before: { held: number; attended: number }; after: { held: number; attended: number } }[],
  rule: AttendanceParams,
  actor: Actor | null,
) {
  const floor = rule.relaxationEnabled ? rule.relaxedCourseMinPct : null;
  const rank: Record<AlertLevel, number> = { OK: 0, WARNING: 1, SHORTAGE: 2, CRITICAL: 3 };
  const raised: { name: string; code: string; pct: number; level: AlertLevel }[] = [];
  for (const c of changes) {
    if (c.after.held < 10) continue;
    const beforePct = c.before.held ? (c.before.attended / c.before.held) * 100 : 100;
    const afterPct = (c.after.attended / c.after.held) * 100;
    const was = levelFor(beforePct, rule.courseMinPct, floor);
    const now = levelFor(afterPct, rule.courseMinPct, floor);
    if (rank[now] <= rank[was] || now === "OK") continue;
    const message =
      now === "CRITICAL"
        ? `Attendance in ${c.code} is ${afterPct.toFixed(1)}%, below ${floor}% — not eligible for the examination even with relaxation.`
        : now === "SHORTAGE"
          ? `Attendance in ${c.code} fell to ${afterPct.toFixed(1)}%, below the required ${rule.courseMinPct}%. Contact the Academic Section about relaxation.`
          : `Attendance in ${c.code} is ${afterPct.toFixed(1)}% — within ${(afterPct - rule.courseMinPct).toFixed(1)} points of the ${rule.courseMinPct}% minimum.`;
    await db.attendanceAlert.create({ data: { studentId: c.studentId, enrolmentId: c.enrolmentId, level: now, pct: Math.round(afterPct * 10) / 10, message, sentById: actor?.id } });
    const student = await db.student.findUniqueOrThrow({ where: { id: c.studentId } });
    await audit({
      actorId: actor?.id, actorRole: actor?.role ?? "SYSTEM", action: "ATTENDANCE_ALERT", entity: "Student", entityId: c.studentId,
      summary: `${student.name} (${student.rollNo}): ${message} SMS and e-mail sent to student and parent.`,
      after: { level: now, pct: afterPct },
    });
    raised.push({ name: student.name, code: c.code, pct: afterPct, level: now });
  }
  return raised;
}

export async function markSession(sessionId: string, input: MarkInput[], actor: Actor, source: "FACULTY" | "BIOMETRIC", reason?: string) {
  const loaded = await loadSession(sessionId);
  if (!loaded) return { error: "Class not found." };
  const { session, rows, rule } = loaded;
  const isTeacher = session.course.facultyId === actor.id;
  if (!isTeacher && !CORRECTOR_ROLES.includes(actor.role)) return { error: "Only the course teacher can mark attendance for this class." };
  if (session.startsAt.getTime() > Date.now() + 15 * 60000) return { error: "Attendance can be marked only once the class has started." };
  const correction = session.status === "MARKED" && (!isTeacher || istDay(session.markedAt!) !== istDay(new Date()));
  if (correction && (reason ?? "").trim().length < 5) return { error: "Changing attendance after the day it was marked needs a reason (recorded in the audit trail)." };
  const valid = new Map(rows.map((r) => [r.enrolmentId, r]));
  const clean = input.filter((i) => valid.has(i.enrolmentId) && STATUSES.includes(i.status));
  if (clean.length !== rows.length) return { error: "Every student on the roll needs a status." };

  const before = new Map(rows.map((r) => [r.enrolmentId, { held: r.held, attended: r.attended }]));
  const previous = new Map(session.records.map((r) => [r.enrolmentId, r.status]));
  await db.$transaction([
    ...clean.map((i) =>
      db.attendanceRecord.upsert({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId: i.enrolmentId } },
        create: { sessionId, enrolmentId: i.enrolmentId, status: i.status },
        update: { status: i.status },
      }),
    ),
    db.classSession.update({ where: { id: sessionId }, data: { status: "MARKED", source, markedById: session.markedById ?? actor.id, markedAt: session.markedAt ?? new Date() } }),
  ]);
  const after = await recompute(clean.map((i) => i.enrolmentId));
  const changed = clean.filter((i) => previous.get(i.enrolmentId) !== i.status);
  const present = clean.filter((i) => countsAsPresent(i.status)).length;
  const label = `${session.course.code} · ${istDate(session.startsAt)} ${istTime(session.startsAt)}`;
  await audit({
    actorId: actor.id, actorRole: actor.role, action: correction ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_MARKED", entity: "ClassSession", entityId: sessionId,
    summary: correction
      ? `${label}: ${changed.length} record(s) corrected — ${reason}`
      : `${label}: ${present} present, ${clean.length - present} absent${source === "BIOMETRIC" ? " (from biometric reader, reviewed by teacher)" : ""}`,
    before: correction ? Object.fromEntries(changed.map((c) => [valid.get(c.enrolmentId)!.rollNo, previous.get(c.enrolmentId) ?? null])) : undefined,
    after: Object.fromEntries(changed.map((c) => [valid.get(c.enrolmentId)!.rollNo, c.status])),
  });
  const alerts = rule
    ? await raiseAlerts(
        clean.map((i) => ({ enrolmentId: i.enrolmentId, studentId: valid.get(i.enrolmentId)!.studentId, code: session.course.code, before: before.get(i.enrolmentId)!, after: after.get(i.enrolmentId)! })),
        rule,
        actor,
      )
    : [];
  return { ok: true, present, absent: clean.length - present, alerts };
}

export const sevenDaysAgo = () => new Date(Date.now() - 7 * 86400000);

export const dueClassCount = (facultyId?: string) =>
  db.classSession.count({ where: { status: "SCHEDULED", startsAt: { lte: new Date(Date.now() + 15 * 60000) }, ...(facultyId ? { course: { facultyId } } : {}) } });

/** A marked class can be changed freely by its teacher on the day it was marked; any later change needs a reason. */
export function needsCorrectionReason(session: { status: string; markedAt: Date | null; course: { facultyId: string | null } }, userId: string) {
  return session.status === "MARKED" && (session.course.facultyId !== userId || !session.markedAt || istDay(session.markedAt) !== istDay(new Date()));
}

export async function classesOverview(facultyId: string | null) {
  const soon = new Date(Date.now() + 15 * 60000);
  const scope = facultyId ? { course: { facultyId } } : {};
  const include = { course: { include: { faculty: true } }, records: { select: { status: true } } } as const;
  const [due, recent, courses] = await Promise.all([
    db.classSession.findMany({ where: { ...scope, status: "SCHEDULED", startsAt: { lte: soon } }, include, orderBy: { startsAt: "asc" } }),
    db.classSession.findMany({ where: { ...scope, status: "MARKED" }, include, orderBy: { startsAt: "desc" }, take: 12 }),
    db.course.findMany({
      where: { ...(facultyId ? { facultyId } : {}), classSessions: { some: {} } },
      include: {
        faculty: true,
        enrolments: { where: { status: "ACTIVE" }, include: { attendance: true, student: { include: { batch: true } } } },
        _count: { select: { classSessions: { where: { status: "MARKED" } } } },
      },
      orderBy: { code: "asc" },
    }),
  ]);
  const rules = new Map<string, AttendanceParams | null>();
  const courseRows = [];
  for (const c of courses) {
    const programmeId = c.enrolments[0]?.student.batch.programmeId;
    if (programmeId && !rules.has(programmeId)) rules.set(programmeId, await attendanceRule(programmeId));
    const rule = programmeId ? rules.get(programmeId) : null;
    const pcts = c.enrolments.filter((e) => e.attendance?.classesHeld).map((e) => (e.attendance!.classesAttended / e.attendance!.classesHeld) * 100);
    const levels = pcts.map((p) => (rule ? levelFor(p, rule.courseMinPct, rule.relaxationEnabled ? rule.relaxedCourseMinPct : null) : "OK"));
    courseRows.push({
      id: c.id, code: c.code, title: c.title, faculty: c.faculty?.name ?? "—", held: c._count.classSessions, planned: c.plannedSessions, students: c.enrolments.length,
      avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null, minPct: rule?.courseMinPct ?? null,
      below: levels.filter((l) => l === "SHORTAGE" || l === "CRITICAL").length, warning: levels.filter((l) => l === "WARNING").length,
    });
  }
  return { due, recent, courses: courseRows };
}

// ─── Leave ───────────────────────────────────────────────────────────

export async function applyLeave(studentId: string, input: { type: string; from: string; to: string; reason: string; document?: string }, actor: Actor) {
  if (!["MEDICAL", "DUTY"].includes(input.type)) return { error: "Choose medical or duty leave." };
  const from = new Date(`${input.from}T00:00:00+05:30`);
  const to = new Date(`${input.to}T23:59:59+05:30`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return { error: "Check the leave dates." };
  if ((to.getTime() - from.getTime()) / 86400000 > 30) return { error: "A single application can cover at most 30 days." };
  if (input.reason.trim().length < 10) return { error: "Describe the reason for leave." };
  const leave = await db.leaveRequest.create({ data: { studentId, type: input.type, fromDate: from, toDate: to, reason: input.reason.trim(), document: input.document || null } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "LEAVE_APPLIED", entity: "LeaveRequest", entityId: leave.id, summary: `${input.type === "MEDICAL" ? "Medical" : "Duty"} leave applied for ${input.from} to ${input.to}` });
  return { ok: true };
}

export async function decideLeave(leaveId: string, approve: boolean, note: string, actor: Actor) {
  if (!["HOD", "ACADEMIC_STAFF", "COE"].includes(actor.role)) return { error: "Only the Dean or the Academic Section can decide leave." };
  const leave = await db.leaveRequest.findUniqueOrThrow({ where: { id: leaveId }, include: { student: { include: { batch: true } } } });
  if (leave.status !== "PENDING") return { error: "This application has already been decided." };
  let sessions = 0;
  const raisedTo: string[] = [];
  if (approve) {
    const records = await db.attendanceRecord.findMany({
      where: { enrolment: { studentId: leave.studentId }, status: "ABSENT", session: { status: "MARKED", startsAt: { gte: leave.fromDate, lte: leave.toDate } } },
      include: { enrolment: { include: { course: true } } },
    });
    const status = leave.type === "MEDICAL" ? "MEDICAL_LEAVE" : "DUTY_LEAVE";
    await db.attendanceRecord.updateMany({ where: { id: { in: records.map((r) => r.id) } }, data: { status } });
    sessions = records.length;
    const after = await recompute([...new Set(records.map((r) => r.enrolmentId))]);
    for (const [enrolmentId, s] of after) {
      const code = records.find((r) => r.enrolmentId === enrolmentId)!.enrolment.course.code;
      raisedTo.push(`${code} ${((s.attended / s.held) * 100).toFixed(1)}%`);
    }
  }
  await db.leaveRequest.update({ where: { id: leaveId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: note || null, sessions } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED", entity: "LeaveRequest", entityId: leaveId,
    summary: `${leave.student.name}: ${leave.type === "MEDICAL" ? "medical" : "duty"} leave ${approve ? `approved — ${sessions} class record(s) updated${leave.type === "DUTY" ? " and counted as attendance" : " (recorded; counts as absence, supports relaxation)"}` : "rejected"}${note ? ` · ${note}` : ""}`,
    after: approve ? { sessions, courses: raisedTo } : undefined,
  });
  return { ok: true, sessions, courses: raisedTo };
}

// ─── Formal shortage notices ─────────────────────────────────────────

export async function sendShortageNotices(batchId: string, actor: Actor) {
  const batch = await db.batch.findUniqueOrThrow({ where: { id: batchId } });
  const rule = await attendanceRule(batch.programmeId);
  if (!rule) return { error: "No attendance rule is configured for this programme." };
  const enrolments = await db.enrolment.findMany({ where: { student: { batchId }, status: "ACTIVE", attendance: { isNot: null } }, include: { attendance: true, student: true, course: true } });
  const today = istDay(new Date());
  const recent = await db.attendanceAlert.findMany({ where: { level: "NOTICE", enrolmentId: { in: enrolments.map((e) => e.id) }, createdAt: { gte: new Date(Date.now() - 86400000) } } });
  let sent = 0;
  for (const e of enrolments) {
    const pct = (e.attendance!.classesAttended / e.attendance!.classesHeld) * 100;
    if (pct >= rule.courseMinPct || recent.some((r) => r.enrolmentId === e.id && istDay(r.createdAt) === today)) continue;
    await db.attendanceAlert.create({
      data: {
        studentId: e.studentId, enrolmentId: e.id, level: "NOTICE", pct: Math.round(pct * 10) / 10, sentById: actor.id,
        message: `Formal notice: attendance in ${e.course.code} is ${pct.toFixed(1)}% against the required ${rule.courseMinPct}%. Eligibility for the end-semester examination is at risk.`,
      },
    });
    sent++;
  }
  await audit({ actorId: actor.id, actorRole: actor.role, action: "SHORTAGE_NOTICES_SENT", entity: "Batch", entityId: batchId, summary: `${sent} attendance-shortage notice(s) sent to students and parents of ${batch.name}` });
  return { ok: true, sent };
}
