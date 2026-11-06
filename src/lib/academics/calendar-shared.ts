export const EVENT_TYPES: Record<string, { label: string; dot: string; chip: string }> = {
  TEACHING: { label: "Teaching term", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800 border-sky-200" },
  EXAM: { label: "Examination", dot: "bg-brand-600", chip: "bg-brand-50 text-brand-800 border-brand-200" },
  HOLIDAY: { label: "Holiday", dot: "bg-red-500", chip: "bg-red-50 text-red-800 border-red-200" },
  VACATION: { label: "Vacation", dot: "bg-rose-400", chip: "bg-rose-50 text-rose-800 border-rose-200" },
  DEADLINE: { label: "Deadline", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-900 border-amber-200" },
  ADMISSION: { label: "Admissions", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-800 border-violet-200" },
  EVENT: { label: "Event", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

/** Days on which no class or examination may be scheduled. */
export const CLOSED_TYPES = ["HOLIDAY", "VACATION"];

/** Calendar dates are plain days in IST; they travel as "YYYY-MM-DD". */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const dayOf = (s: string) => new Date(`${s}T00:00:00Z`);
export const addDays = (s: string, n: number) => isoDay(new Date(dayOf(s).getTime() + n * 86400000));
export const istDay = (d: Date) => isoDay(new Date(d.getTime() + 330 * 60000));
export const weekday = (s: string) => dayOf(s).getUTCDay();

/** Month grid (Monday-first) for "YYYY-MM": every day shown, including the edges of neighbouring months. */
export function monthGrid(month: string) {
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7;
  const start = addDays(first, -lead);
  const next = month.slice(5) === "12" ? `${Number(month.slice(0, 4)) + 1}-01-01` : `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, "0")}-01`;
  const last = addDays(next, -1);
  const trail = (7 - ((weekday(last) + 6) % 7) - 1) % 7;
  return { days: daysBetween(start, addDays(last, trail)), first, last, prev: addDays(first, -1).slice(0, 7), next: next.slice(0, 7) };
}

export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
