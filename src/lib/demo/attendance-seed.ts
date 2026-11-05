import { db } from "../db";
import { countsAsPresent, levelFor } from "../attendance/shared";
import type { AttendanceParams } from "../rules/engine";
import { DEMO_LEAVES, DEMO_LIVE_CLASS } from "./constants";
import { rng } from "./scenarios";

export type AttendancePlan = { enrolmentId: string; studentId: string; rollNo: string; code: string; courseId: string; academicYear: string; slot: number; attended: number; programmeId: string };

const HOLIDAYS = new Set(["2026-08-15", "2026-09-04", "2026-10-02", "2026-10-19", "2026-10-20", "2026-10-21"]);
const TEACHING_END = "2026-11-05";
/** IST 09:30, 10:30, 11:30, 12:30, 14:30, 15:30 as UTC "HH:MM". */
const SLOTS_UTC = ["04:00", "05:00", "06:00", "07:00", "09:00", "10:00"];

/** The last `count` working days (Mon–Fri, excluding holidays) up to and including the end date. */
function teachingDays(count: number) {
  const days: string[] = [];
  const d = new Date(`${TEACHING_END}T00:00:00Z`);
  while (days.length < count) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(iso)) days.unshift(iso);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

/**
 * Expands each enrolment's target attendance into day-by-day class records (the totals stay exactly as planned),
 * then derives the course-wise summaries, leave applications and the shortage alerts that would have been sent.
 */
export async function seedDailyAttendance(plan: AttendancePlan[], planned: number, users: Record<string, string>) {
  const r = rng(20261105);
  const days = teachingDays(planned);
  const leaves = DEMO_LEAVES.map((l) => ({ ...l, days: days.map((d, i) => ({ d, i })).filter(({ d }) => d >= l.from && d <= l.to).map(({ i }) => i) }));
  const rules = new Map<string, AttendanceParams>();
  for (const rule of await db.ruleSet.findMany({ where: { type: "ATTENDANCE", isActive: true } })) rules.set(rule.programmeId!, rule.params as unknown as AttendanceParams);

  const byCourse = new Map<string, AttendancePlan[]>();
  for (const p of plan) byCourse.set(p.courseId, [...(byCourse.get(p.courseId) ?? []), p]);

  const summaries: { enrolmentId: string; classesHeld: number; classesAttended: number; medicalLeaveDays: number; biometricCount: number }[] = [];
  const alerts: { studentId: string; enrolmentId: string; level: string; pct: number; message: string; createdAt: Date }[] = [];

  for (const [courseId, rows] of byCourse) {
    const { code, academicYear, slot } = rows[0];
    const course = await db.course.findUniqueOrThrow({ where: { id: courseId } });
    const live = code === DEMO_LIVE_CLASS.course;
    const sessions = await db.classSession.createManyAndReturn({
      data: days.map((d, i) => {
        const startsAt = new Date(`${d}T${SLOTS_UTC[slot % SLOTS_UTC.length]}:00Z`);
        const scheduled = live && i === days.length - 1;
        return {
          courseId, academicYear, startsAt, kind: i % 9 === 8 ? "TUTORIAL" : code === "BL9.5" && i % 4 === 3 ? "MOOT_PRACTICE" : "LECTURE",
          status: scheduled ? "SCHEDULED" : "MARKED", source: scheduled ? null : i % 3 === 0 ? "BIOMETRIC" : "FACULTY",
          markedById: scheduled ? null : course.facultyId, markedAt: scheduled ? null : new Date(startsAt.getTime() + 55 * 60000),
        };
      }),
      select: { id: true, startsAt: true, status: true },
    });
    sessions.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    const records: { sessionId: string; enrolmentId: string; status: string }[] = [];
    for (const p of rows) {
      const leave = leaves.find((l) => l.roll === p.rollNo);
      const forcedAbsent = new Set<number>(leave?.days ?? []);
      const forcedPresent = new Set<number>();
      if (live) (DEMO_LIVE_CLASS.absent.includes(p.rollNo) ? forcedAbsent : forcedPresent).add(days.length - 1);
      const absences = planned - p.attended;
      const pool = days.map((_, i) => i).filter((i) => !forcedAbsent.has(i) && !forcedPresent.has(i));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const absent = new Set([...[...forcedAbsent].slice(0, absences), ...pool.slice(0, Math.max(0, absences - forcedAbsent.size))]);
      const statuses = days.map((_, i) => {
        if (!absent.has(i)) return "PRESENT";
        if (leave?.days.includes(i) && leave.status === "APPROVED") return leave.type === "MEDICAL" ? "MEDICAL_LEAVE" : "DUTY_LEAVE";
        return "ABSENT";
      });

      let held = 0;
      let attended = 0;
      let medical = 0;
      const rule = rules.get(p.programmeId);
      const floor = rule?.relaxationEnabled ? rule.relaxedCourseMinPct : null;
      let events: { i: number; pct: number; level: "SHORTAGE" | "CRITICAL" }[] = [];
      let prevLevel = "OK";
      sessions.forEach((s, i) => {
        if (s.status !== "MARKED") return;
        records.push({ sessionId: s.id, enrolmentId: p.enrolmentId, status: statuses[i] });
        held++;
        if (countsAsPresent(statuses[i])) attended++;
        if (statuses[i] === "MEDICAL_LEAVE") medical++;
        if (!rule || held < 15) return;
        const pct = (attended / held) * 100;
        const level = levelFor(pct, rule.courseMinPct, floor);
        if (level === "OK" || level === "WARNING") events = [];
        else if (level !== prevLevel && (level === "CRITICAL" || prevLevel !== "CRITICAL")) events.push({ i, pct, level });
        prevLevel = level;
      });
      summaries.push({ enrolmentId: p.enrolmentId, classesHeld: held, classesAttended: attended, medicalLeaveDays: medical, biometricCount: attended });

      for (const ev of rule ? events : []) {
        alerts.push({
          studentId: p.studentId, enrolmentId: p.enrolmentId, level: ev.level, pct: Math.round(ev.pct * 10) / 10,
          message:
            ev.level === "CRITICAL"
              ? `Attendance in ${code} is ${ev.pct.toFixed(1)}%, below ${floor}% — not eligible for the examination even with relaxation.`
              : `Attendance in ${code} fell to ${ev.pct.toFixed(1)}%, below the required ${rule!.courseMinPct}%. Contact the Academic Section about relaxation.`,
          createdAt: new Date(sessions[ev.i].startsAt.getTime() + 2 * 3600000),
        });
      }
    }
    await db.attendanceRecord.createMany({ data: records });
  }
  await db.attendanceSummary.createMany({ data: summaries });
  await db.attendanceAlert.createMany({ data: alerts });

  for (const l of leaves) {
    const student = await db.student.findUniqueOrThrow({ where: { rollNo: l.roll } });
    await db.leaveRequest.create({
      data: {
        studentId: student.id, type: l.type, fromDate: new Date(`${l.from}T00:00:00+05:30`), toDate: new Date(`${l.to}T23:59:59+05:30`),
        reason: l.reason, document: l.document, status: l.status, createdAt: new Date(`${l.from}T09:00:00+05:30`),
        ...(l.status === "APPROVED" ? { decidedById: users.hod, decidedAt: new Date(`${l.to}T17:00:00+05:30`), decisionNote: "Discharge summary verified.", sessions: l.days.length * plan.filter((p) => p.rollNo === l.roll).length } : {}),
      },
    });
  }
  return { sessions: byCourse.size * planned, alerts: alerts.length };
}
