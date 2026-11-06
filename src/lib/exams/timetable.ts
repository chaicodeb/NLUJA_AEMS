import { db } from "../db";
import { audit } from "../audit";
import { closedDays } from "../academics/calendar";
import { dayOf, istDay } from "../academics/calendar-shared";
import { SESSION_TIME, checkTimetable, generateTimetable, type Session, type TimetableRules, type TimetableSlot } from "./timetable-shared";

type Actor = { id: string; role: string };

const paperTime = (date: string, session: Session) => {
  const d = dayOf(date);
  d.setUTCHours(SESSION_TIME[session].utcHour, SESSION_TIME[session].utcMin);
  return d;
};

/** Papers due in an examination: for every running batch, the courses of the semester being examined that have a written component. */
export async function timetableContext(examId: string, window?: { from: string; to: string; gap: number }) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: true } });
  const seated = await db.seatAllocation.count({ where: { examPaper: { examId } } });
  const from = window?.from ?? istDay(exam.startDate);
  const to = window?.to ?? istDay(exam.endDate);
  const batches = await db.batch.findMany({
    where: { students: { some: { status: "ACTIVE" } } },
    include: {
      programme: true, _count: { select: { students: { where: { status: "ACTIVE" } } } },
      curriculumVersion: { include: { courses: { include: { scheme: { include: { components: true } } }, orderBy: { code: "asc" } } } },
    },
    orderBy: { code: "asc" },
  });
  const slots: TimetableSlot[] = [];
  for (const b of batches) {
    const odd = b.currentSemester % 2 === 1;
    const sem = (exam.parity === "ODD") === odd ? b.currentSemester : b.currentSemester + 1;
    if (sem > b.programme.durationSemesters) continue;
    for (const c of b.curriculumVersion.courses.filter((x) => x.semester === sem && x.scheme.components.some((k) => k.source === "EXAM"))) {
      const p = exam.papers.find((x) => x.courseId === c.id);
      slots.push({
        courseId: c.id, code: c.code, title: c.title, group: b.code, groupLabel: `${b.code} (Sem ${sem})`, candidates: b._count.students,
        date: p ? istDay(p.date) : null, session: p ? (p.session as Session) : null,
      });
    }
  }
  const rooms = await db.room.findMany();
  const rules: TimetableRules = { from, to, minGapDays: window?.gap ?? exam.timetableGapDays, closed: await closedDays(from, to), capacity: rooms.reduce((a, r) => a + r.rows * r.cols, 0) };
  const locked = seated > 0 || exam.admitCardsPublished || !["PLANNED", "REGISTRATION"].includes(exam.status);
  return { exam, slots, rules, locked, issues: checkTimetable(slots, rules) };
}

export async function proposeTimetable(examId: string, window: { from: string; to: string; gap: number }) {
  if (window.to < window.from) return { error: "The window ends before it starts." };
  const ctx = await timetableContext(examId, window);
  if (ctx.locked) return { error: "Seating has been generated; the timetable is locked." };
  const slots = generateTimetable(ctx.slots, ctx.rules);
  return { ok: true, slots, rules: ctx.rules, issues: checkTimetable(slots, ctx.rules) };
}

export async function saveTimetable(examId: string, entries: { courseId: string; date: string | null; session: Session | null }[], window: { from: string; to: string; gap: number }, actor: Actor) {
  const ctx = await timetableContext(examId, window);
  if (ctx.locked) return { error: "Seating has been generated; the timetable is locked." };
  const slots = ctx.slots.map((s) => {
    const e = entries.find((x) => x.courseId === s.courseId);
    return e ? { ...s, date: e.date, session: e.session } : s;
  });
  const issues = checkTimetable(slots, ctx.rules);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) return { error: errors[0].message, issues };
  const courses = await db.course.findMany({ where: { id: { in: slots.map((s) => s.courseId) } }, include: { scheme: { include: { components: true } } } });
  let created = 0;
  let moved = 0;
  for (const s of slots) {
    const at = paperTime(s.date!, s.session!);
    const existing = ctx.exam.papers.find((p) => p.courseId === s.courseId);
    if (existing) {
      if (existing.date.getTime() !== at.getTime() || existing.session !== s.session) {
        await db.examPaper.update({ where: { id: existing.id }, data: { date: at, session: s.session! } });
        moved++;
      }
      continue;
    }
    const c = courses.find((x) => x.id === s.courseId)!;
    const end = c.scheme.components.find((k) => k.source === "EXAM")!;
    await db.examPaper.create({
      data: {
        examId, courseId: c.id, date: at, session: s.session!, durationMins: end.maxMarks <= 50 ? 120 : 180, maxMarks: end.maxMarks, setterId: c.facultyId,
        questionScheme: Array.from({ length: 5 }, (_, k) => ({ q: `Q${k + 1}`, max: Math.round(end.maxMarks / 5) })),
      },
    });
    created++;
  }
  await db.exam.update({ where: { id: examId }, data: { startDate: paperTime(window.from, "FN"), endDate: new Date(paperTime(window.to, "AN").getTime() + 3 * 3600000), timetableGapDays: window.gap } });
  const warnings = issues.filter((i) => i.level === "warning").length;
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "TIMETABLE_SAVED", entity: "Exam", entityId: examId,
    summary: `${ctx.exam.code}: timetable saved — ${slots.length} papers${created ? `, ${created} created` : ""}${moved ? `, ${moved} rescheduled` : ""}; no clashes${warnings ? `, ${warnings} warning(s) accepted` : ""}`,
  });
  return { ok: true, created, moved };
}

export async function publishTimetable(examId: string, actor: Actor) {
  const ctx = await timetableContext(examId);
  if (ctx.slots.some((s) => !s.date)) return { error: "Save a complete timetable first." };
  if (ctx.issues.some((i) => i.level === "error")) return { error: "Resolve the clashes before publishing." };
  await db.exam.update({ where: { id: examId }, data: { timetablePublishedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "TIMETABLE_PUBLISHED", entity: "Exam", entityId: examId, summary: `${ctx.exam.code}: date sheet of ${ctx.slots.length} papers published to students and staff (${ctx.rules.from} to ${ctx.rules.to})` });
  return { ok: true };
}

export async function planExam(input: { code: string; name: string; parity: string; academicYear: string; from: string; to: string; fee: number }, actor: Actor) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,30}$/.test(code)) return { error: "Use a code like ESE-EVEN-2027." };
  if (await db.exam.findUnique({ where: { code } })) return { error: "That code is already used." };
  if (input.name.trim().length < 6) return { error: "Enter the examination name." };
  if (!["ODD", "EVEN"].includes(input.parity)) return { error: "Choose odd or even semester." };
  if (!/^\d{4}-\d{2}$/.test(input.academicYear)) return { error: "Academic year like 2026-27." };
  if (!(input.from && input.to && input.to >= input.from)) return { error: "Enter a valid window." };
  const exam = await db.exam.create({
    data: { code, name: input.name.trim(), type: "REGULAR", academicYear: input.academicYear, parity: input.parity, status: "PLANNED", startDate: paperTime(input.from, "FN"), endDate: paperTime(input.to, "AN"), feeAmount: input.fee || 0 },
  });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "EXAM_PLANNED", entity: "Exam", entityId: exam.id, summary: `${code} ${exam.name} planned for ${input.from} to ${input.to}` });
  return { ok: true, id: exam.id };
}
