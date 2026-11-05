import { db } from "../db";

export type ColumnType = "text" | "number";
export type Column = { key: string; label: string; type: ColumnType };
export type Row = Record<string, string | number | null>;
export type Dataset = { key: string; label: string; description: string; modules: string[]; columns: Column[] };

export const DATASETS: Dataset[] = [
  {
    key: "student_performance",
    label: "Student performance",
    description: "Student master with semester attendance and latest result",
    modules: ["Student Lifecycle", "Attendance", "Result Processing"],
    columns: [
      { key: "uid", label: "UID", type: "text" },
      { key: "rollNo", label: "Roll No.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "gender", label: "Gender", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "programme", label: "Programme", type: "text" },
      { key: "batch", label: "Batch", type: "text" },
      { key: "semester", label: "Semester", type: "number" },
      { key: "attendancePct", label: "Aggregate attendance %", type: "number" },
      { key: "sgpa", label: "SGPA", type: "number" },
      { key: "cgpa", label: "CGPA", type: "number" },
      { key: "result", label: "Result", type: "text" },
      { key: "division", label: "Division", type: "text" },
      { key: "backlogs", label: "Backlogs", type: "number" },
    ],
  },
  {
    key: "course_results",
    label: "Course-wise results",
    description: "Every course result with attendance and eligibility",
    modules: ["Academic Management", "Attendance", "Examination", "Result Processing"],
    columns: [
      { key: "rollNo", label: "Roll No.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "batch", label: "Batch", type: "text" },
      { key: "courseCode", label: "Course code", type: "text" },
      { key: "courseTitle", label: "Course", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "faculty", label: "Faculty", type: "text" },
      { key: "credits", label: "Credits", type: "number" },
      { key: "attendancePct", label: "Attendance %", type: "number" },
      { key: "eligibility", label: "Eligibility", type: "text" },
      { key: "total", label: "Marks", type: "number" },
      { key: "grade", label: "Grade", type: "text" },
      { key: "gradePoint", label: "Grade point", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "grace", label: "Grace", type: "number" },
    ],
  },
  {
    key: "exam_registrations",
    label: "Examination registrations & fees",
    description: "Registrations, papers and fee reconciliation",
    modules: ["Examination", "Finance"],
    columns: [
      { key: "rollNo", label: "Roll No.", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "batch", label: "Batch", type: "text" },
      { key: "papers", label: "Papers", type: "number" },
      { key: "fee", label: "Fee (₹)", type: "number" },
      { key: "paymentRef", label: "Payment ref", type: "text" },
      { key: "admitCard", label: "Admit card", type: "text" },
    ],
  },
];

const pct = (a?: number | null, h?: number | null) => (h ? Math.round(((a ?? 0) / h) * 10000) / 100 : null);

export async function loadDataset(key: string): Promise<Row[]> {
  const exam = await db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" }, type: "REGULAR" }, orderBy: { startDate: "desc" } });
  const run = exam ? await db.resultRun.findFirst({ where: { examId: exam.id, status: { not: "WITHDRAWN" } }, orderBy: { processedAt: "desc" } }) : null;

  if (key === "student_performance") {
    const students = await db.student.findMany({
      include: {
        batch: { include: { programme: true } },
        enrolments: { where: { academicYear: exam?.academicYear }, include: { attendance: true } },
        semResults: run ? { where: { runId: run.id } } : false,
        courseResults: run ? { where: { runId: run.id } } : false,
      },
      orderBy: { rollNo: "asc" },
    });
    return students.map((s) => {
      const held = s.enrolments.reduce((a, e) => a + (e.attendance?.classesHeld ?? 0), 0);
      const att = s.enrolments.reduce((a, e) => a + (e.attendance?.classesAttended ?? 0), 0);
      const sr = s.semResults?.[0];
      return {
        uid: s.uid, rollNo: s.rollNo, name: s.name, gender: s.gender === "F" ? "Female" : "Male", category: s.category,
        programme: s.batch.programme.code, batch: s.batch.code, semester: s.batch.currentSemester, attendancePct: pct(att, held),
        sgpa: sr?.sgpa ?? null, cgpa: sr?.cgpa ?? null, result: sr?.result ?? "—", division: sr?.division ?? "—",
        backlogs: s.courseResults ? s.courseResults.filter((c) => ["FAIL", "AB", "NA"].includes(c.status)).length : null,
      };
    });
  }
  if (key === "course_results") {
    const enrolments = await db.enrolment.findMany({
      where: { academicYear: exam?.academicYear, status: "ACTIVE" },
      include: {
        student: { include: { batch: true } }, course: { include: { faculty: true } }, attendance: true,
        eligibilities: exam ? { where: { examId: exam.id } } : false, courseResults: run ? { where: { runId: run.id } } : false,
      },
    });
    return enrolments
      .map((e) => {
        const cr = e.courseResults?.[0];
        return {
          rollNo: e.student.rollNo, name: e.student.name, batch: e.student.batch.code, courseCode: e.course.code, courseTitle: e.course.title,
          category: e.course.category, faculty: e.course.faculty?.name ?? "—", credits: e.course.credits,
          attendancePct: pct(e.attendance?.classesAttended, e.attendance?.classesHeld), eligibility: e.eligibilities?.[0]?.status ?? "—",
          total: cr?.total ?? null, grade: cr?.grade ?? "—", gradePoint: cr?.gradePoint ?? null, status: cr?.status ?? "—", grace: cr?.grace ?? null,
        };
      })
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo) || a.courseCode.localeCompare(b.courseCode));
  }
  if (key === "exam_registrations" && exam) {
    const regs = await db.examRegistration.findMany({ where: { examId: exam.id }, include: { student: { include: { batch: true } }, _count: { select: { papers: true } } }, orderBy: { student: { rollNo: "asc" } } });
    return regs.map((r) => ({
      rollNo: r.student.rollNo, name: r.student.name, batch: r.student.batch.code, papers: r._count.papers,
      fee: r.feePaid ? exam.feeAmount : 0, paymentRef: r.paymentRef ?? "—", admitCard: r.admitCardCode ?? "Not issued",
    }));
  }
  return [];
}

export type Filter = { column: string; op: "eq" | "neq" | "lt" | "gt" | "contains"; value: string };
export type ReportConfig = { dataset: string; columns: string[]; filters: Filter[]; groupBy?: string; aggregate?: { fn: "count" | "avg" | "sum"; column?: string }; sort?: { column: string; dir: "asc" | "desc" } };

export async function runReport(config: ReportConfig) {
  const ds = DATASETS.find((d) => d.key === config.dataset);
  if (!ds) return { columns: [], rows: [] as Row[] };
  let rows = await loadDataset(ds.key);
  for (const f of config.filters) {
    const col = ds.columns.find((c) => c.key === f.column);
    if (!col || f.value === "") continue;
    rows = rows.filter((r) => {
      const v = r[f.column];
      if (col.type === "number") {
        const n = Number(v);
        const x = Number(f.value);
        if (v == null) return false;
        return f.op === "eq" ? n === x : f.op === "neq" ? n !== x : f.op === "lt" ? n < x : f.op === "gt" ? n > x : String(v).includes(f.value);
      }
      const s = String(v ?? "").toLowerCase();
      const x = f.value.toLowerCase();
      return f.op === "eq" ? s === x : f.op === "neq" ? s !== x : f.op === "contains" ? s.includes(x) : f.op === "lt" ? s < x : s > x;
    });
  }

  if (config.groupBy) {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = String(r[config.groupBy] ?? "—");
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const agg = config.aggregate ?? { fn: "count" };
    const groupLabel = ds.columns.find((c) => c.key === config.groupBy)?.label ?? config.groupBy;
    const aggLabel = agg.fn === "count" ? "Count" : `${agg.fn === "avg" ? "Average" : "Total"} ${ds.columns.find((c) => c.key === agg.column)?.label ?? ""}`;
    const out: Row[] = Array.from(groups.entries()).map(([k, list]) => {
      let value: number;
      if (agg.fn === "count" || !agg.column) value = list.length;
      else {
        const nums = list.map((r) => Number(r[agg.column!])).filter((n) => !Number.isNaN(n) && n !== null);
        const total = nums.reduce((a, b) => a + b, 0);
        value = agg.fn === "sum" ? total : nums.length ? Math.round((total / nums.length) * 100) / 100 : 0;
      }
      return { [config.groupBy!]: k, __value: value };
    });
    out.sort((a, b) => String(a[config.groupBy!]).localeCompare(String(b[config.groupBy!])));
    return { columns: [{ key: config.groupBy, label: groupLabel, type: "text" as const }, { key: "__value", label: aggLabel, type: "number" as const }], rows: out };
  }

  if (config.sort) {
    const { column, dir } = config.sort;
    rows = [...rows].sort((a, b) => {
      const x = a[column];
      const y = b[column];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return dir === "asc" ? c : -c;
    });
  }
  const columns = ds.columns.filter((c) => config.columns.includes(c.key));
  return { columns, rows: rows.slice(0, 1000).map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key]]))) };
}
