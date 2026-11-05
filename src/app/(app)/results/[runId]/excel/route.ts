import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import type { ComponentResult } from "@/lib/results/engine";
import type { GradingParams } from "@/lib/rules/engine";

const MAX_COMPONENTS = 5;
const HEAD = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF843F13" } } };

function header(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) {
  ws.columns = cols;
  ws.getRow(1).eachCell((c) => {
    c.font = HEAD.font;
    c.fill = HEAD.fill;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  ws.getRow(1).height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function GET(_: Request, ctx: RouteContext<"/results/[runId]/excel">) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user.role, "/results")) return new Response("Forbidden", { status: 403 });
  const { runId } = await ctx.params;
  const run = await db.resultRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      exam: true,
      courseResults: { include: { student: { include: { batch: true } }, enrolment: { include: { course: true } } } },
      semResults: { include: { student: true } },
    },
  });
  const rules = run.rulesUsed as { grading: { key: string; version: number } };
  const gradingRule = await db.ruleSet.findUniqueOrThrow({ where: { key_version: { key: rules.grading.key, version: rules.grading.version } } });
  const grading = gradingRule.params as unknown as GradingParams;

  const wb = new ExcelJS.Workbook();
  wb.creator = "NLUJA AEMS";
  wb.created = new Date();
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF2F7D3A" } } });

  // ── Sheet 1: grading rule (lookup table, ascending) ──
  const gr = wb.addWorksheet("Grading rule");
  header(gr, [
    { header: "Minimum %", key: "min", width: 12 },
    { header: "Grade", key: "grade", width: 10 },
    { header: "Grade point", key: "point", width: 12 },
    { header: "Description", key: "label", width: 20 },
  ]);
  const bands = [{ min: 0, grade: grading.failGrade, point: grading.failPoint, label: "Fail" }, ...[...grading.bands].sort((a, b) => a.min - b.min)];
  bands.forEach((b) => gr.addRow(b));
  const lastBand = bands.length + 1;
  gr.addRow([]);
  gr.addRow([`Rule ${gradingRule.key} version ${gradingRule.version} — as applied by the system to this run`]);
  const GRADE_TABLE = `'Grading rule'!$A$2:$C$${lastBand}`;

  // ── Sheet 2: course results with independent recomputation ──
  const cs = wb.addWorksheet("Course results");
  const compCols = Array.from({ length: MAX_COMPONENTS }, (_, i) => [
    { header: `C${i + 1}`, key: `c${i}n`, width: 7 },
    { header: `C${i + 1} marks`, key: `c${i}m`, width: 8 },
  ]).flat();
  header(cs, [
    { header: "Roll No.", key: "roll", width: 11 },
    { header: "Student", key: "name", width: 20 },
    { header: "Course", key: "course", width: 8 },
    { header: "Credits", key: "credits", width: 8 },
    { header: "Max", key: "max", width: 6 },
    ...compCols,
    { header: "Raw total (=SUM)", key: "raw", width: 10 },
    { header: "Grace (system)", key: "grace", width: 9 },
    { header: "Total", key: "total", width: 8 },
    { header: "%", key: "pct", width: 8 },
    { header: "Status (system)", key: "status", width: 10 },
    { header: "Grade (Excel)", key: "mgrade", width: 9 },
    { header: "Grade pt (Excel)", key: "mgp", width: 9 },
    { header: "Credit pts (Excel)", key: "mcp", width: 10 },
    { header: "Grade (system)", key: "sgrade", width: 9 },
    { header: "Grade pt (system)", key: "sgp", width: 9 },
    { header: "Match", key: "match", width: 8 },
  ]);
  const col = (key: string) => cs.getColumn(key).letter;
  const rows = [...run.courseResults].sort((a, b) => a.student.rollNo.localeCompare(b.student.rollNo) || a.enrolment.course.code.localeCompare(b.enrolment.course.code));
  rows.forEach((c, i) => {
    const r = i + 2;
    const comps = c.components as unknown as ComponentResult[];
    const max = comps.reduce((a, x) => a + x.max, 0);
    const data: Record<string, unknown> = {
      roll: c.student.rollNo, name: c.student.name, course: c.enrolment.course.code, credits: c.credits, max,
      grace: c.grace, status: c.status, sgrade: c.grade, sgp: c.gradePoint,
    };
    comps.slice(0, MAX_COMPONENTS).forEach((x, j) => {
      data[`c${j}n`] = x.code;
      data[`c${j}m`] = x.marks ?? 0;
    });
    cs.addRow(data);
    const markCells = Array.from({ length: MAX_COMPONENTS }, (_, j) => `${col(`c${j}m`)}${r}`).join(",");
    const pct = (c.total / max) * 100;
    cs.getCell(`${col("raw")}${r}`).value = { formula: `SUM(${markCells})`, result: c.rawTotal };
    cs.getCell(`${col("total")}${r}`).value = { formula: `${col("raw")}${r}+${col("grace")}${r}`, result: c.total };
    cs.getCell(`${col("pct")}${r}`).value = { formula: `${col("total")}${r}/${col("max")}${r}*100`, result: pct };
    cs.getCell(`${col("pct")}${r}`).numFmt = "0.00";
    const st = `${col("status")}${r}`;
    cs.getCell(`${col("mgrade")}${r}`).value = {
      formula: `IF(${st}="PASS",VLOOKUP(${col("pct")}${r},${GRADE_TABLE},2,TRUE),IF(${st}="FAIL","${grading.failGrade}",${st}))`,
      result: c.grade,
    };
    cs.getCell(`${col("mgp")}${r}`).value = { formula: `IF(${st}="PASS",VLOOKUP(${col("pct")}${r},${GRADE_TABLE},3,TRUE),0)`, result: c.gradePoint };
    cs.getCell(`${col("mcp")}${r}`).value = { formula: `${col("credits")}${r}*${col("mgp")}${r}`, result: c.credits * c.gradePoint };
    cs.getCell(`${col("match")}${r}`).value = { formula: `AND(${col("mgrade")}${r}=${col("sgrade")}${r},${col("mgp")}${r}=${col("sgp")}${r})`, result: true };
  });
  const lastCourseRow = rows.length + 1;

  // ── Sheet 3: semester results — SGPA/CGPA recomputed ──
  const ss = wb.addWorksheet("SGPA & CGPA");
  header(ss, [
    { header: "Roll No.", key: "roll", width: 11 },
    { header: "Student", key: "name", width: 22 },
    { header: "Credits (Excel)", key: "cr", width: 10 },
    { header: "Credit points (Excel)", key: "cp", width: 12 },
    { header: "SGPA (Excel)", key: "msgpa", width: 10 },
    { header: "SGPA (system)", key: "ssgpa", width: 10 },
    { header: "Prior credits", key: "pcr", width: 9 },
    { header: "Prior Σ(Ci×Si)", key: "pcp", width: 11 },
    { header: "CGPA (Excel)", key: "mcgpa", width: 10 },
    { header: "CGPA (system)", key: "scgpa", width: 10 },
    { header: "SGPA match", key: "m1", width: 9 },
    { header: "CGPA match", key: "m2", width: 9 },
  ]);
  const sems = [...run.semResults].sort((a, b) => a.student.rollNo.localeCompare(b.student.rollNo));
  const rollCol = `'Course results'!$${col("roll")}$2:$${col("roll")}$${lastCourseRow}`;
  const crCol = `'Course results'!$${col("credits")}$2:$${col("credits")}$${lastCourseRow}`;
  const cpCol = `'Course results'!$${col("mcp")}$2:$${col("mcp")}$${lastCourseRow}`;
  for (const [i, s] of sems.entries()) {
    const r = i + 2;
    const prior = await db.semesterResult.findMany({ where: { studentId: s.studentId, semester: { lt: s.semester }, run: { status: "PUBLISHED" } } });
    const pcr = prior.reduce((a, p) => a + p.credits, 0);
    const pcp = Math.round(prior.reduce((a, p) => a + p.sgpa * p.credits, 0) * 10000) / 10000;
    ss.addRow({ roll: s.student.rollNo, name: s.student.name, ssgpa: s.sgpa, pcr, pcp, scgpa: s.cgpa });
    ss.getCell(`C${r}`).value = { formula: `SUMIF(${rollCol},A${r},${crCol})`, result: s.credits };
    ss.getCell(`D${r}`).value = { formula: `SUMIF(${rollCol},A${r},${cpCol})`, result: Math.round(s.sgpa * s.credits) };
    ss.getCell(`E${r}`).value = { formula: `ROUND(D${r}/C${r},${grading.rounding})`, result: s.sgpa };
    ss.getCell(`I${r}`).value = { formula: `ROUND((H${r}+E${r}*C${r})/(G${r}+C${r}),${grading.rounding})`, result: s.cgpa };
    ss.getCell(`K${r}`).value = { formula: `E${r}=F${r}`, result: true };
    ss.getCell(`L${r}`).value = { formula: `I${r}=J${r}`, result: true };
  }

  // ── Summary (first sheet) ──
  sum.getColumn(1).width = 46;
  sum.getColumn(2).width = 18;
  sum.addRow(["National Law University and Judicial Academy, Assam"]).font = { bold: true, size: 13 };
  sum.addRow([`Independent verification workbook — ${run.exam.name}`]);
  sum.addRow([`Result run ${run.id} · status ${run.status} · generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`]);
  sum.addRow([]);
  const lastSem = sems.length + 1;
  const items: [string, string, number | boolean][] = [
    ["Course results checked", `COUNTA('Course results'!A2:A${lastCourseRow})`, rows.length],
    ["Grade & grade point match (Excel = system)", `COUNTIF('Course results'!${col("match")}2:${col("match")}${lastCourseRow},TRUE)`, rows.length],
    ["Students checked", `COUNTA('SGPA & CGPA'!A2:A${lastSem})`, sems.length],
    ["SGPA match", `COUNTIF('SGPA & CGPA'!K2:K${lastSem},TRUE)`, sems.length],
    ["CGPA match", `COUNTIF('SGPA & CGPA'!L2:L${lastSem},TRUE)`, sems.length],
  ];
  for (const [label, formula, result] of items) {
    const row = sum.addRow([label]);
    row.getCell(2).value = { formula, result };
  }
  sum.addRow([]);
  sum.addRow(["Every grade, grade point, SGPA and CGPA in this workbook is recomputed with live Excel formulas from the raw component marks and the grading table."]);
  sum.addRow(["Change any mark or grading band to see the recomputation; the Match columns compare against the values computed by the system."]);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nluja-result-verification-${runId.slice(-6)}.xlsx"`,
    },
  });
}
