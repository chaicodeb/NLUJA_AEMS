import type { Role } from "@prisma/client";

export type Condition = { fact: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: string };
export type Step = { name: string; roles: Role[]; when?: Condition | null; slaDays: number };
export type Fact = { key: string; label: string; kind: "number" | "choice"; options?: [string, string][] };
export type ProcessKey = "LEAVE" | "PROFILE_CORRECTION";

export type ProcessSpec = {
  label: string;
  description: string;
  /** Screen where the steps are decided. */
  screen: string;
  /** Roles that can be put on a step (they must be able to open the decision screen). */
  roles: Role[];
  facts: Fact[];
  /** Version 1, matching how the University worked before the chain was configured. */
  defaults: Step[];
  example: Record<string, string>;
};

export const PROCESSES: Record<ProcessKey, ProcessSpec> = {
  LEAVE: {
    label: "Student leave application",
    description: "Medical and duty leave applied for by students. On final approval the classes missed are marked as leave.",
    screen: "/attendance/leave",
    roles: ["HOD", "ACADEMIC_STAFF", "COE"],
    facts: [
      { key: "type", label: "Leave type", kind: "choice", options: [["MEDICAL", "Medical leave"], ["DUTY", "Duty leave"]] },
      { key: "days", label: "Number of days", kind: "number" },
    ],
    defaults: [{ name: "Leave decision", roles: ["HOD", "ACADEMIC_STAFF", "COE"], slaDays: 3 }],
    example: { type: "MEDICAL", days: "5" },
  },
  PROFILE_CORRECTION: {
    label: "Correction of a student's identity details",
    description: "Changes to name, date of birth, parent's name or category requested by a student. On final approval the record is updated.",
    screen: "/profile-requests",
    roles: ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"],
    facts: [{ key: "field", label: "Field being corrected", kind: "choice", options: [["name", "Name"], ["dob", "Date of birth"], ["parentName", "Father's / guardian's name"], ["category", "Social category"]] }],
    defaults: [{ name: "Verification against documents", roles: ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"], slaDays: 5 }],
    example: { field: "name" },
  },
};

export const OPS: [Condition["op"], string][] = [["eq", "is"], ["neq", "is not"], ["gt", "is more than"], ["gte", "is at least"], ["lt", "is less than"], ["lte", "is at most"]];

export function matches(c: Condition | null | undefined, facts: Record<string, string | number>) {
  if (!c) return true;
  const v = facts[c.fact];
  if (v == null) return false;
  const [a, b] = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(c.value) ? [Number(v), Number(c.value)] : [String(v), c.value];
  switch (c.op) {
    case "eq": return a === b;
    case "neq": return a !== b;
    case "gt": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
  }
}

/** The steps a particular request goes through. */
export const applicable = (steps: Step[], facts: Record<string, string | number>) => steps.filter((s) => matches(s.when, facts));

export function describeCondition(process: ProcessKey, c: Condition) {
  const fact = PROCESSES[process].facts.find((f) => f.key === c.fact);
  const value = fact?.options?.find(([k]) => k === c.value)?.[1] ?? c.value;
  return `${fact?.label ?? c.fact} ${OPS.find(([o]) => o === c.op)?.[1] ?? c.op} ${value}`;
}

export function validateSteps(process: ProcessKey, steps: Step[]): string | null {
  const spec = PROCESSES[process];
  if (!steps.length) return "Add at least one approval step.";
  for (const [i, s] of steps.entries()) {
    if (s.name.trim().length < 3) return `Step ${i + 1}: give the step a name.`;
    if (!s.roles.length) return `Step ${i + 1}: choose who approves it.`;
    if (s.roles.some((r) => !spec.roles.includes(r))) return `Step ${i + 1}: that role cannot open the ${spec.label.toLowerCase()} screen.`;
    if (!(s.slaDays >= 1 && s.slaDays <= 30)) return `Step ${i + 1}: the target must be 1–30 days.`;
    if (s.when && (!spec.facts.some((f) => f.key === s.when!.fact) || s.when.value === "")) return `Step ${i + 1}: complete the condition or remove it.`;
  }
  if (steps.every((s) => s.when)) return "At least one step must apply to every request (no condition).";
  return null;
}
