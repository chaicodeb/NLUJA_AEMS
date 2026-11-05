export type SubCriterion = { code: string; name: string; max: number };
export type SheetRow = {
  enrolmentId: string;
  rollNo: string;
  name: string;
  marks: number | null;
  absent: boolean;
  detail: Record<string, number | null> | null;
};
export type RowInput = { enrolmentId: string; marks: number | null; absent: boolean; detail?: Record<string, number | null> | null };
export type RowError = { enrolmentId: string; rollNo: string; message: string };
export type SheetStats = { total: number; entered: number; absent: number; mean: number | null; min: number | null; max: number | null; bins: number[]; belowPass: number };

export const SHEET_STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "red" }> = {
  DRAFT: { label: "Draft — with teacher", tone: "amber" },
  RETURNED: { label: "Returned for correction", tone: "red" },
  SUBMITTED: { label: "Submitted — awaiting verification", tone: "blue" },
  VERIFIED: { label: "Verified & locked", tone: "green" },
};

export const isOpenSheet = (status: string) => status === "DRAFT" || status === "RETURNED";
export const isOverdue = (s: { status: string; deadline: Date }) => isOpenSheet(s.status) && s.deadline.getTime() < Date.now();

export function sheetStats(rows: Pick<SheetRow, "marks" | "absent">[], max: number, passMarks: number | null): SheetStats {
  const vals = rows.filter((r) => !r.absent && r.marks != null).map((r) => r.marks!);
  const bins = [0, 0, 0, 0, 0];
  for (const v of vals) bins[Math.min(4, Math.floor((v / max) * 5))]++;
  return {
    total: rows.length,
    entered: vals.length + rows.filter((r) => r.absent).length,
    absent: rows.filter((r) => r.absent).length,
    mean: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
    bins,
    belowPass: passMarks == null ? 0 : vals.filter((v) => v < passMarks).length,
  };
}

/** Range and half-mark granularity; blank rows are allowed in a draft but not at submission. */
export function validateRows(rows: RowInput[], max: number, criteria: SubCriterion[], rollOf: (id: string) => string): RowError[] {
  const errors: RowError[] = [];
  const bad = (r: RowInput, message: string) => errors.push({ enrolmentId: r.enrolmentId, rollNo: rollOf(r.enrolmentId), message });
  for (const r of rows) {
    if (r.absent) continue;
    if (criteria.length && r.detail) {
      for (const c of criteria) {
        const msg = markProblem(r.detail[c.code] ?? null, c.max);
        if (msg) bad(r, `${c.name}: ${msg}`);
      }
    }
    const msg = markProblem(r.marks, max);
    if (msg) bad(r, msg);
  }
  return errors;
}

export function markProblem(v: number | null, max: number): string | null {
  if (v == null) return null;
  if (!Number.isFinite(v) || v < 0 || v > max) return `${Number.isFinite(v) ? v : "value"} is outside 0–${max}`;
  if (Math.abs(v * 2 - Math.round(v * 2)) > 1e-9) return "use steps of 0.5";
  return null;
}
