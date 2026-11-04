import jsonLogic, { type RulesLogic } from "json-logic-js";
import type { RuleSet } from "@prisma/client";

// ─── Attendance & examination eligibility ─────────────────────────────

export type AttendanceParams = {
  courseMinPct: number;
  semesterMinPct: number | null;
  relaxationEnabled: boolean;
  relaxedCourseMinPct: number;
  aggregateMinPct: number;
  relaxationAuthority: string;
  relaxationGrounds: string[];
};

export type AttendanceFacts = {
  coursePct: number;
  aggregatePct: number;
  relaxationApproved: boolean;
  relaxationPending: boolean;
};

export type EligibilityStatus = "ELIGIBLE" | "INELIGIBLE" | "PENDING_RELAXATION" | "RELAXED";

export function compileAttendance(p: AttendanceParams) {
  const meetsNormal: RulesLogic[] = [{ ">=": [{ var: "coursePct" }, p.courseMinPct] }];
  if (p.semesterMinPct != null) meetsNormal.push({ ">=": [{ var: "aggregatePct" }, p.semesterMinPct] });
  const eligible: RulesLogic = { and: meetsNormal };
  const relaxable: RulesLogic = p.relaxationEnabled
    ? {
        and: [
          { "!": eligible },
          { ">=": [{ var: "coursePct" }, p.relaxedCourseMinPct] },
          { ">=": [{ var: "aggregatePct" }, p.aggregateMinPct] },
        ],
      }
    : false;
  return { eligible, relaxable };
}

export function evaluateAttendance(p: AttendanceParams, f: AttendanceFacts): { status: EligibilityStatus; reason: string; relaxable: boolean } {
  const logic = compileAttendance(p);
  const isEligible = jsonLogic.apply(logic.eligible, f) as boolean;
  const relaxable = jsonLogic.apply(logic.relaxable, f) as boolean;
  const c = f.coursePct.toFixed(2);
  const a = f.aggregatePct.toFixed(2);

  if (isEligible) {
    return { status: "ELIGIBLE", relaxable: false, reason: `Course attendance ${c}% ≥ ${p.courseMinPct}%${p.semesterMinPct != null ? `; semester ${a}% ≥ ${p.semesterMinPct}%` : ""}` };
  }
  if (relaxable) {
    if (f.relaxationApproved) return { status: "RELAXED", relaxable, reason: `${c}% in course — relaxation approved by ${authorityLabel(p.relaxationAuthority)} (aggregate ${a}%)` };
    if (f.relaxationPending) return { status: "PENDING_RELAXATION", relaxable, reason: `${c}% in course; relaxation request awaiting ${authorityLabel(p.relaxationAuthority)}` };
    return { status: "INELIGIBLE", relaxable, reason: `${c}% < ${p.courseMinPct}% — may apply for relaxation (aggregate ${a}% ≥ ${p.aggregateMinPct}%)` };
  }
  if (f.coursePct < p.courseMinPct && p.relaxationEnabled && f.coursePct < p.relaxedCourseMinPct) {
    return { status: "INELIGIBLE", relaxable, reason: `${c}% is below the relaxation floor of ${p.relaxedCourseMinPct}% — not relaxable` };
  }
  if (f.coursePct < p.courseMinPct && p.relaxationEnabled && f.aggregatePct < p.aggregateMinPct) {
    return { status: "INELIGIBLE", relaxable, reason: `${c}% in course and aggregate ${a}% < ${p.aggregateMinPct}% — not relaxable` };
  }
  if (p.semesterMinPct != null && f.aggregatePct < p.semesterMinPct) {
    return { status: "INELIGIBLE", relaxable, reason: `Semester attendance ${a}% < ${p.semesterMinPct}%` };
  }
  return { status: "INELIGIBLE", relaxable, reason: `${c}% < ${p.courseMinPct}%` };
}

export function authorityLabel(a: string) {
  return { VC: "the Vice-Chancellor", COE: "the Controller of Examinations", REGISTRAR: "the Registrar" }[a] ?? a;
}

// ─── Grading ──────────────────────────────────────────────────────────

export type GradeBand = { min: number; grade: string; point: number; label: string };
export type GradingParams = {
  bands: GradeBand[];
  failGrade: string;
  failPoint: number;
  rounding: number;
  divisions: { minCgpa: number; label: string }[];
  degreeMinCgpa: number;
};

export function gradeFor(p: GradingParams, pctScore: number) {
  const band = [...p.bands].sort((a, b) => b.min - a.min).find((b) => pctScore >= b.min);
  return band ? { grade: band.grade, point: band.point, label: band.label } : { grade: p.failGrade, point: p.failPoint, label: "Fail" };
}

export function divisionFor(p: GradingParams, cgpa: number) {
  return [...p.divisions].sort((a, b) => b.minCgpa - a.minCgpa).find((d) => cgpa >= d.minCgpa)?.label ?? null;
}

export function round(n: number, places: number) {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// ─── Grace marks ──────────────────────────────────────────────────────

export type GraceParams = {
  enabled: boolean;
  maxPerCourse: number;
  maxPerSemester: number;
  maxCourses: number;
  onlyToPass: boolean;
  approvingAuthority: string;
};

// ─── Loading active rules ─────────────────────────────────────────────

export function asParams<T>(r: Pick<RuleSet, "params">): T {
  return r.params as unknown as T;
}

export const RULE_FIELD_HELP: Record<string, string> = {
  courseMinPct: "Minimum attendance required in each course to sit the end-semester examination.",
  semesterMinPct: "Optional overall semester minimum (leave blank to disable).",
  relaxationEnabled: "Allow the competent authority to relax the course requirement.",
  relaxedCourseMinPct: "Absolute floor — below this, no relaxation is possible.",
  aggregateMinPct: "Aggregate attendance across all courses required for relaxation.",
  relaxationAuthority: "Authority who may approve a relaxation.",
};
