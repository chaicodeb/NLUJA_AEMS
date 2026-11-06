export const CATEGORIES: Record<string, { label: string; team: string; teamLabel: string }> = {
  ACCESS: { label: "Sign-in & access", team: "ADMIN", teamLabel: "IT Section" },
  EXAMS: { label: "Examination registration, admit card, seating", team: "EXAM_STAFF", teamLabel: "Examination Branch" },
  RESULTS: { label: "Results, revaluation, grade sheets", team: "EXAM_STAFF", teamLabel: "Examination Branch" },
  DOCUMENTS: { label: "Certificates, transcripts, DigiLocker", team: "EXAM_STAFF", teamLabel: "Examination Branch" },
  ATTENDANCE: { label: "Attendance & leave", team: "ACADEMIC_STAFF", teamLabel: "Academic Section" },
  ADMISSIONS: { label: "Admissions & profile", team: "ACADEMIC_STAFF", teamLabel: "Academic Section" },
  FEES: { label: "Fees & refunds", team: "ACCOUNTS", teamLabel: "Finance & Accounts" },
  OTHER: { label: "Something else", team: "ADMIN", teamLabel: "IT Section" },
};

/** Hours to first response and to resolution (calendar hours). */
export const SLA: Record<string, { label: string; respond: number; resolve: number; tone: "neutral" | "blue" | "amber" | "red" }> = {
  LOW: { label: "Low", respond: 24, resolve: 120, tone: "neutral" },
  MEDIUM: { label: "Medium", respond: 8, resolve: 72, tone: "blue" },
  HIGH: { label: "High", respond: 4, resolve: 24, tone: "amber" },
  CRITICAL: { label: "Critical", respond: 1, resolve: 4, tone: "red" },
};

export const STATUS: Record<string, { label: string; tone: "neutral" | "blue" | "amber" | "green" | "violet" }> = {
  OPEN: { label: "Open", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  WAITING_USER: { label: "Waiting for you", tone: "amber" },
  RESOLVED: { label: "Resolved", tone: "green" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const AGENT_ROLES = ["ADMIN", "EXAM_STAFF", "ACADEMIC_STAFF", "ACCOUNTS"];
export const ticketNo = (n: number) => `HD-${n}`;

export type SlaState = { level: "met" | "ok" | "risk" | "breached" | "done"; label: string; due: Date | null };

/** Where the ticket stands against its current target; "risk" = less than a quarter of the window left. */
export function slaState(t: { status: string; createdAt: Date; responseDueAt: Date; resolveDueAt: Date; firstResponseAt: Date | null; resolvedAt: Date | null }, now: Date): SlaState {
  if (t.resolvedAt || t.status === "RESOLVED" || t.status === "CLOSED") {
    const met = t.resolvedAt && t.resolvedAt <= t.resolveDueAt;
    return { level: "done", label: met ? "Resolved within SLA" : "Resolved late", due: null };
  }
  const responding = !t.firstResponseAt;
  const due = responding ? t.responseDueAt : t.resolveDueAt;
  const left = due.getTime() - now.getTime();
  const window = due.getTime() - t.createdAt.getTime();
  const what = responding ? "response" : "resolution";
  if (left <= 0) return { level: "breached", label: `${what} overdue by ${span(-left)}`, due };
  if (left < window / 4) return { level: "risk", label: `${what} due in ${span(left)}`, due };
  return { level: "ok", label: `${what} due in ${span(left)}`, due };
}

function span(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}
