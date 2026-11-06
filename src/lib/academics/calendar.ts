import { db } from "../db";
import { audit } from "../audit";
import { CLOSED_TYPES, EVENT_TYPES, dayOf, daysBetween, isoDay, istDay, monthGrid } from "./calendar-shared";

type Actor = { id: string; role: string };

export async function eventsBetween(from: string, to: string) {
  return db.academicEvent.findMany({ where: { startDate: { lte: dayOf(to) }, endDate: { gte: dayOf(from) } }, orderBy: [{ startDate: "asc" }, { endDate: "desc" }] });
}

/** Everything shown on one month of the calendar for a viewer: events for their audience and published examination papers. */
export async function calendarMonth(month: string | undefined, viewer: { role: string; batch: { curriculumVersionId: string; currentSemester: number } | null }) {
  const today = istDay(new Date());
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const grid = monthGrid(m);
  const isStudent = ["STUDENT", "PARENT"].includes(viewer.role);
  const events = (await eventsBetween(grid.days[0], grid.days.at(-1)!)).filter((e) => !(isStudent && e.audience === "STAFF"));
  const papers = await db.examPaper.findMany({
    where: {
      date: { gte: new Date(dayOf(grid.days[0]).getTime() - 330 * 60000), lt: new Date(dayOf(grid.days.at(-1)!).getTime() + 86400000) },
      exam: { timetablePublishedAt: { not: null } },
      ...(isStudent && viewer.batch ? { course: { curriculumVersionId: viewer.batch.curriculumVersionId, semester: { in: [viewer.batch.currentSemester, viewer.batch.currentSemester + 1] } } } : {}),
    },
    include: { course: true, exam: true },
    orderBy: { date: "asc" },
  });
  return { month: m, today, grid, events, papers: papers.map((p) => ({ ...p, day: istDay(p.date) })) };
}

/** Holidays and vacations expanded to individual days, for scheduling checks. */
export async function closedDays(from: string, to: string) {
  const events = (await eventsBetween(from, to)).filter((e) => CLOSED_TYPES.includes(e.type));
  const map = new Map<string, string>();
  for (const e of events) for (const d of daysBetween(isoDay(e.startDate), isoDay(e.endDate))) if (d >= from && d <= to && !map.has(d)) map.set(d, e.title);
  return [...map.entries()].map(([date, title]) => ({ date, title }));
}

/** Classes and examination papers already scheduled on the given days (IST). */
async function scheduledOn(from: string, to: string) {
  const start = new Date(dayOf(from).getTime() - 330 * 60000);
  const end = new Date(dayOf(to).getTime() + 86400000 - 330 * 60000);
  const [classes, papers] = await Promise.all([
    db.classSession.count({ where: { startsAt: { gte: start, lt: end }, status: "SCHEDULED" } }),
    db.examPaper.findMany({ where: { date: { gte: start, lt: end } }, include: { course: true, exam: true } }),
  ]);
  return { classes, papers };
}

export async function saveEvent(input: { id?: string; title: string; type: string; startDate: string; endDate: string; audience: string; description: string }, actor: Actor) {
  if (input.title.trim().length < 3) return { error: "Give the entry a title." };
  if (!EVENT_TYPES[input.type]) return { error: "Choose a type." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) return { error: "Enter valid dates." };
  if (input.endDate < input.startDate) return { error: "The end date is before the start date." };
  const year = Number(input.startDate.slice(0, 4));
  const academicYear = Number(input.startDate.slice(5, 7)) >= 7 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
  const data = {
    title: input.title.trim(), type: input.type, startDate: dayOf(input.startDate), endDate: dayOf(input.endDate), audience: input.audience || "ALL",
    description: input.description.trim() || null, academicYear,
  };
  const before = input.id ? await db.academicEvent.findUnique({ where: { id: input.id } }) : null;
  const ev = input.id ? await db.academicEvent.update({ where: { id: input.id }, data }) : await db.academicEvent.create({ data: { ...data, createdById: actor.id } });
  const range = input.startDate === input.endDate ? input.startDate : `${input.startDate} to ${input.endDate}`;
  await audit({
    actorId: actor.id, actorRole: actor.role, action: before ? "CALENDAR_UPDATED" : "CALENDAR_ADDED", entity: "AcademicEvent", entityId: ev.id,
    summary: `${EVENT_TYPES[input.type].label} "${data.title}" ${before ? "changed" : "added"} (${range})`,
    ...(before ? { before: { title: before.title, start: isoDay(before.startDate), end: isoDay(before.endDate) } } : {}),
  });

  let warning: string | undefined;
  if (CLOSED_TYPES.includes(input.type)) {
    const { classes, papers } = await scheduledOn(input.startDate, input.endDate);
    if (classes || papers.length) {
      warning = `${[classes ? `${classes} scheduled class(es)` : "", papers.length ? `${papers.length} examination paper(s) (${papers.map((p) => p.course.code).join(", ")})` : ""].filter(Boolean).join(" and ")} fall on this ${EVENT_TYPES[input.type].label.toLowerCase()} — reschedule them.`;
    }
  }
  return { ok: true, warning };
}

export async function deleteEvent(id: string, actor: Actor) {
  const ev = await db.academicEvent.findUnique({ where: { id } });
  if (!ev) return { error: "Entry not found." };
  await db.academicEvent.delete({ where: { id } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "CALENDAR_REMOVED", entity: "AcademicEvent", entityId: id, summary: `${EVENT_TYPES[ev.type]?.label ?? ev.type} "${ev.title}" removed (${isoDay(ev.startDate)})` });
  return { ok: true };
}
