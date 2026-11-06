import { addDays, daysBetween, weekday } from "../academics/calendar-shared";

export type Session = "FN" | "AN";
export type TimetableSlot = { courseId: string; code: string; title: string; group: string; groupLabel: string; candidates: number; date: string | null; session: Session | null };
export type TimetableRules = { from: string; to: string; minGapDays: number; closed: { date: string; title: string }[]; capacity: number };
export type Issue = { level: "error" | "warning"; message: string; courseIds: string[] };

export const SESSION_TIME: Record<Session, { label: string; utcHour: number; utcMin: number }> = {
  FN: { label: "10:00 am", utcHour: 4, utcMin: 30 },
  AN: { label: "2:00 pm", utcHour: 8, utcMin: 30 },
};

export function openDays(r: TimetableRules) {
  const closed = new Set(r.closed.map((c) => c.date));
  return daysBetween(r.from, r.to).filter((d) => weekday(d) !== 0 && !closed.has(d));
}

const gapDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Hard errors block saving; warnings are shown for the Controller's judgement. */
export function checkTimetable(slots: TimetableSlot[], r: TimetableRules): Issue[] {
  const issues: Issue[] = [];
  const closed = new Map(r.closed.map((c) => [c.date, c.title]));
  const unscheduled = slots.filter((s) => !s.date || !s.session);
  if (unscheduled.length) issues.push({ level: "error", message: `${unscheduled.length} paper(s) not yet scheduled: ${unscheduled.map((s) => s.code).join(", ")}.`, courseIds: unscheduled.map((s) => s.courseId) });
  for (const s of slots) {
    if (!s.date || !s.session) continue;
    if (s.date < r.from || s.date > r.to) issues.push({ level: "error", message: `${s.code} is outside the examination window.`, courseIds: [s.courseId] });
    else if (weekday(s.date) === 0) issues.push({ level: "error", message: `${s.code} falls on a Sunday (${s.date}).`, courseIds: [s.courseId] });
    else if (closed.has(s.date)) issues.push({ level: "error", message: `${s.code} falls on ${closed.get(s.date)} (${s.date}).`, courseIds: [s.courseId] });
  }
  const groups = new Map<string, TimetableSlot[]>();
  for (const s of slots.filter((x) => x.date)) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  for (const [, list] of groups) {
    const sorted = [...list].sort((a, b) => (a.date! + a.session).localeCompare(b.date! + b.session));
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      if (a.date === b.date && a.session === b.session) issues.push({ level: "error", message: `Clash: ${a.groupLabel} has ${a.code} and ${b.code} in the same session on ${a.date}.`, courseIds: [a.courseId, b.courseId] });
      else if (a.date === b.date) issues.push({ level: "error", message: `${a.groupLabel} has two papers on ${a.date} (${a.code}, ${b.code}).`, courseIds: [a.courseId, b.courseId] });
      else if (gapDays(a.date!, b.date!) - 1 < r.minGapDays) issues.push({ level: "warning", message: `${a.groupLabel}: only ${gapDays(a.date!, b.date!) - 1} day(s) between ${a.code} and ${b.code} (rule: ${r.minGapDays}).`, courseIds: [a.courseId, b.courseId] });
    }
  }
  const load = new Map<string, TimetableSlot[]>();
  for (const s of slots.filter((x) => x.date && x.session)) load.set(`${s.date} ${s.session}`, [...(load.get(`${s.date} ${s.session}`) ?? []), s]);
  for (const [k, list] of load) {
    const n = list.reduce((a, s) => a + s.candidates, 0);
    if (n > r.capacity) issues.push({ level: "warning", message: `${k}: ${n} candidates exceed the ${r.capacity} seats available.`, courseIds: list.map((s) => s.courseId) });
  }
  return issues;
}

/**
 * Greedy generator: each batch writes at most one paper a day with at least `minGapDays` free days between papers;
 * batches alternate between forenoon and afternoon so invigilation load is spread, and seat capacity is respected.
 */
export function generateTimetable(slots: TimetableSlot[], r: TimetableRules): TimetableSlot[] {
  const days = openDays(r);
  const groups = [...new Set(slots.map((s) => s.group))].sort();
  const queue = new Map(groups.map((g) => [g, slots.filter((s) => s.group === g).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))]));
  const gap = r.minGapDays;
  const used = new Map<string, number>();
  const out: TimetableSlot[] = [];
  groups.forEach((g, gi) => {
    let earliest = r.from;
    for (const s of queue.get(g)!) {
      const prefer: Session[] = gi % 2 === 0 ? ["FN", "AN"] : ["AN", "FN"];
      let placed: TimetableSlot | null = null;
      for (const d of days.filter((x) => x >= earliest)) {
        for (const sess of prefer) {
          const key = `${d} ${sess}`;
          if ((used.get(key) ?? 0) + s.candidates <= r.capacity) {
            placed = { ...s, date: d, session: sess };
            used.set(key, (used.get(key) ?? 0) + s.candidates);
            break;
          }
        }
        if (placed) break;
      }
      out.push(placed ?? { ...s, date: null, session: null });
      if (placed) earliest = addDays(placed.date!, gap + 1);
    }
  });
  return out;
}
