import type { MessageKey } from "../i18n/messages";
import { makeT, type Vars } from "../i18n/translate";

export const RECORD_STATUS: Record<string, { label: string; short: string; tone: "green" | "red" | "blue" | "violet" }> = {
  PRESENT: { label: "Present", short: "P", tone: "green" },
  ABSENT: { label: "Absent", short: "A", tone: "red" },
  DUTY_LEAVE: { label: "Duty leave", short: "DL", tone: "blue" },
  MEDICAL_LEAVE: { label: "Medical leave", short: "ML", tone: "violet" },
};

/** Approved duty leave (representing the University) counts as attendance; medical leave is evidence for relaxation only. */
export const countsAsPresent = (status: string) => status === "PRESENT" || status === "DUTY_LEAVE";

/** Students within this many percentage points above the minimum get an early warning. */
export const WARNING_MARGIN = 3;

export type AlertLevel = "OK" | "WARNING" | "SHORTAGE" | "CRITICAL";

export const LEVEL_INFO: Record<AlertLevel | "NOTICE", { label: string; tone: "green" | "amber" | "red" | "blue" }> = {
  OK: { label: "On track", tone: "green" },
  WARNING: { label: "Close to minimum", tone: "amber" },
  SHORTAGE: { label: "Below minimum", tone: "red" },
  CRITICAL: { label: "Below relaxation floor", tone: "red" },
  NOTICE: { label: "Shortage notice", tone: "blue" },
};

export function levelFor(pct: number, minPct: number, floorPct: number | null): AlertLevel {
  if (floorPct != null && pct < floorPct) return "CRITICAL";
  if (pct < minPct) return "SHORTAGE";
  if (pct < minPct + WARNING_MARGIN) return "WARNING";
  return "OK";
}

export type Standing = {
  pct: number; held: number; attended: number; remaining: number; level: AlertLevel; canMiss: number | null;
  advice: string;
  /** The same advice as a translatable message and its values. */
  adviceMsg: [MessageKey, Vars];
};

export function standing(attended: number, held: number, planned: number, minPct: number, floorPct: number | null): Standing {
  const pct = held ? (attended / held) * 100 : 100;
  const remaining = Math.max(0, planned - held);
  const needed = Math.ceil((minPct * Math.max(planned, held)) / 100);
  const canMiss = attended + remaining - needed;
  const level = levelFor(pct, minPct, floorPct);
  const vars = { pct: pct.toFixed(1), min: minPct, n: remaining, k: Math.min(canMiss, remaining) };
  const key: MessageKey =
    remaining === 0
      ? pct >= minPct ? "Final: {pct}% — meets {min}%" : floorPct != null && pct >= floorPct ? "Final: {pct}% — below {min}%; relaxation may be sought" : "Final: {pct}% — below {min}%"
      : canMiss < 0 ? "Cannot reach {min}% even by attending all {n} remaining classes"
        : canMiss === 0 ? "Must attend every one of the {n} remaining classes"
          : "Can miss at most {k} of the {n} remaining classes";
  return { pct, held, attended, remaining, level, canMiss: remaining ? canMiss : null, advice: makeT("en")(key, vars), adviceMsg: [key, vars] };
}

const IST = "Asia/Kolkata";
export const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });
export const istTime = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit" });
export const istDate = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "2-digit", month: "short", year: "numeric" });
