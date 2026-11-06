export type DocSpec = { code: string; label: string; hint?: string; when?: "RESERVED" | "PWD" };
export type MeritComponent = { code: string; label: string; max: number; weight: number };
export type MeritRule = {
  components: MeritComponent[];
  qualifying: { code: string; pct: number; relaxedPct: number };
  eligibility: { degree: string; minPct: number; relaxedMinPct: number };
  regulation: string;
};
export type SeatMatrix = Record<string, number>;
export type Marks = Record<string, number>;

export const SEAT_LABELS: Record<string, string> = { UR: "Unreserved (open merit)", OBC: "OBC-NCL", SC: "SC", ST: "ST", EWS: "EWS" };
export const CATEGORY_LABELS: Record<string, string> = { GEN: "General", OBC: "OBC-NCL", SC: "SC", ST: "ST", EWS: "EWS" };
export const RESEARCH_AREAS = ["Constitutional and Administrative Law", "Criminal Law and Criminology", "Intellectual Property Law", "Environmental Law", "International Law and Human Rights", "Corporate and Commercial Law", "Family Law and Gender Justice", "Law and Technology"];

export const STATUS_META: Record<string, { label: string; tone: "neutral" | "amber" | "red" | "green" | "blue" }> = {
  DRAFT: { label: "Draft — not submitted", tone: "neutral" },
  SUBMITTED: { label: "Awaiting verification", tone: "amber" },
  RETURNED: { label: "Returned for correction", tone: "red" },
  VERIFIED: { label: "Verified", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
};
export const OUTCOME_META: Record<string, { label: string; tone: "neutral" | "amber" | "red" | "green" | "blue" | "violet" }> = {
  OFFERED: { label: "Seat offered", tone: "blue" },
  WAITLISTED: { label: "Waitlisted", tone: "amber" },
  NOT_QUALIFIED: { label: "Did not qualify", tone: "neutral" },
  ADMITTED: { label: "Admitted", tone: "green" },
  DECLINED: { label: "Declined", tone: "neutral" },
};

export const CYCLE_STATUS: Record<string, { label: string; tone: "blue" | "amber" | "green" | "neutral" }> = {
  APPLICATIONS: { label: "Applications open", tone: "blue" },
  EVALUATION: { label: "Verification & evaluation", tone: "amber" },
  MERIT_PUBLISHED: { label: "Merit list published", tone: "green" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

/** UGC relaxations apply to SC, ST, OBC-NCL, EWS and persons with disability. */
export const isRelaxed = (a: { category: string; pwd: boolean }) => a.category !== "GEN" || a.pwd;

export function docsFor(specs: DocSpec[], a: { category: string; pwd: boolean }) {
  return specs.filter((d) => !d.when || (d.when === "RESERVED" && a.category !== "GEN") || (d.when === "PWD" && a.pwd));
}
