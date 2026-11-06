import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { getActiveRule } from "../rules/store";
import { asParams, gradeFor, type GradingParams } from "../rules/engine";
import { parseCsv, toCsv } from "./csv";
import { rng } from "../demo/scenarios";

type Actor = { id: string; role: string };
type Row = Record<string, string>;
type Staged = { rowNo: number; data: Row; status: "VALID" | "WARNING" | "ERROR"; messages: string[] };

export const IMPORT_KINDS: Record<string, { label: string; columns: string[]; required: string[]; help: string }> = {
  STUDENTS: {
    label: "Student master records",
    columns: ["uid", "roll_no", "name", "gender", "dob", "email", "phone", "category", "abc_id", "parent_name", "batch_code", "status"],
    required: ["uid", "roll_no", "name", "gender", "batch_code"],
    help: "One row per student. Dates as YYYY-MM-DD. Status ACTIVE, COMPLETED, GRADUATED or WITHDRAWN.",
  },
  RESULTS: {
    label: "Historical course results",
    columns: ["roll_no", "semester", "academic_year", "course_code", "marks", "grade", "credits", "sgpa"],
    required: ["roll_no", "semester", "course_code", "marks", "grade"],
    help: "One row per student per course. The SGPA column (from the source register) is reconciled against the SGPA recomputed from the grades.",
  },
};
const CATEGORIES = ["GEN", "OBC", "SC", "ST", "EWS"];
const STATUSES = ["ACTIVE", "COMPLETED", "GRADUATED", "WITHDRAWN"];

async function legacyRun() {
  return db.resultRun.findFirstOrThrow({ where: { exam: { code: "LEGACY-MIGRATION" } }, orderBy: { processedAt: "asc" } });
}

function finish(rows: Staged[]) {
  for (const r of rows) r.status = r.messages.some((m) => m.startsWith("✖")) ? "ERROR" : r.messages.length ? "WARNING" : "VALID";
  return rows;
}

async function validateStudents(rows: Row[]): Promise<Staged[]> {
  const [batches, existing] = await Promise.all([
    db.batch.findMany(),
    db.student.findMany({ where: { OR: [{ uid: { in: rows.map((r) => r.uid) } }, { rollNo: { in: rows.map((r) => r.roll_no) } }] }, select: { uid: true, rollNo: true } }),
  ]);
  const staged = rows.map((data, i) => ({ rowNo: i + 2, data, status: "VALID" as const, messages: [] as string[] }));
  for (const r of staged) {
    const d = r.data;
    const m = r.messages;
    for (const c of IMPORT_KINDS.STUDENTS.required) if (!d[c]?.trim()) m.push(`✖ ${c} is required`);
    if (d.uid && !/^NLUJA\d{8}$/.test(d.uid)) m.push("✖ uid must look like NLUJA20200001");
    if (existing.some((e) => e.uid === d.uid)) m.push(`✖ University ID ${d.uid} already exists`);
    if (existing.some((e) => e.rollNo === d.roll_no)) m.push(`✖ Roll number ${d.roll_no} already belongs to another student`);
    if (staged.filter((x) => x.data.roll_no === d.roll_no).length > 1) m.push(`✖ Roll number ${d.roll_no} appears more than once in the file`);
    if (d.gender && !["M", "F", "O"].includes(d.gender)) m.push("✖ gender must be M, F or O");
    if (d.batch_code && !batches.some((b) => b.code === d.batch_code)) m.push(`✖ Unknown batch ${d.batch_code}`);
    if (d.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob) || Number.isNaN(Date.parse(d.dob)) || new Date(d.dob).toISOString().slice(0, 10) !== d.dob)) m.push(`✖ Invalid date of birth "${d.dob}" (use YYYY-MM-DD)`);
    if (!d.dob) m.push("Date of birth missing");
    if (d.category && !CATEGORIES.includes(d.category)) m.push(`✖ Category "${d.category}" is not one of ${CATEGORIES.join(", ")}`);
    if (d.status && !STATUSES.includes(d.status)) m.push(`✖ Status "${d.status}" is not recognised`);
    if (!d.abc_id) m.push("No ABC ID — credits cannot be uploaded to the Academic Bank of Credits until it is added");
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) m.push(`Invalid e-mail "${d.email}" — the institutional address will be used`);
  }
  return finish(staged);
}

async function validateResults(rows: Row[]): Promise<Staged[]> {
  const run = await legacyRun();
  const grading = asParams<GradingParams>((await getActiveRule("GRADING"))!);
  const students = await db.student.findMany({
    where: { rollNo: { in: [...new Set(rows.map((r) => r.roll_no))] } },
    include: { batch: { include: { curriculumVersion: { include: { courses: true } } } } },
  });
  const [doneCourses, doneSems] = await Promise.all([
    db.courseResult.findMany({ where: { runId: run.id, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, courseId: true } }),
    db.semesterResult.findMany({ where: { runId: run.id, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, semester: true } }),
  ]);
  const staged: Staged[] = rows.map((data, i) => ({ rowNo: i + 2, data, status: "VALID", messages: [] }));
  for (const r of staged) {
    const d = r.data;
    const m = r.messages;
    for (const c of IMPORT_KINDS.RESULTS.required) if (!d[c]?.trim()) m.push(`✖ ${c} is required`);
    const s = students.find((x) => x.rollNo === d.roll_no);
    if (!s) {
      m.push(`✖ Unknown roll number ${d.roll_no} — import the student first`);
      continue;
    }
    const sem = Number(d.semester);
    const course = s.batch.curriculumVersion.courses.find((c) => c.code === d.course_code);
    if (!course) m.push(`✖ ${d.course_code} is not in ${s.batch.curriculumVersion.code}`);
    else if (course.semester !== sem) m.push(`✖ ${d.course_code} belongs to semester ${course.semester}, not ${sem}`);
    const marks = Number(d.marks);
    if (d.marks === "" || Number.isNaN(marks) || marks < 0 || marks > 100) m.push(`✖ Marks "${d.marks}" must be between 0 and 100`);
    else if (d.grade) {
      const expected = gradeFor(grading, marks);
      if (expected.grade !== d.grade) m.push(`Grade ${d.grade} in the source; the grading regulation gives ${expected.grade} for ${marks} — source grade kept and flagged`);
    }
    if (d.grade && d.grade !== grading.failGrade && !grading.bands.some((b) => b.grade === d.grade)) m.push(`✖ Unknown grade "${d.grade}"`);
    if (course && d.credits && Number(d.credits) !== course.credits) m.push(`Credits ${d.credits} in the source; the curriculum has ${course.credits} — curriculum value used`);
    if (course && doneCourses.some((x) => x.studentId === s.id && x.courseId === course.id)) m.push(`✖ ${d.course_code} has already been migrated for ${d.roll_no}`);
    if (doneSems.some((x) => x.studentId === s.id && x.semester === sem)) m.push(`✖ Semester ${sem} of ${d.roll_no} has already been migrated`);
    if (staged.filter((x) => x.data.roll_no === d.roll_no && x.data.course_code === d.course_code).length > 1) m.push(`✖ ${d.roll_no} ${d.course_code} appears more than once`);
  }

  // Semester-level reconciliation
  const groups = new Map<string, Staged[]>();
  for (const r of staged) groups.set(`${r.data.roll_no}|${r.data.semester}`, [...(groups.get(`${r.data.roll_no}|${r.data.semester}`) ?? []), r]);
  for (const [key, list] of groups) {
    const [roll, semStr] = key.split("|");
    const s = students.find((x) => x.rollNo === roll);
    if (!s) continue;
    if (list.some((r) => r.messages.some((m) => m.startsWith("✖")))) {
      for (const r of list) if (!r.messages.some((m) => m.startsWith("✖"))) r.messages.push(`✖ Held back: another row of ${roll} semester ${semStr} has an error, and a semester is migrated only when complete`);
      continue;
    }
    const sem = Number(semStr);
    const curriculumCourses = s.batch.curriculumVersion.courses.filter((c) => c.semester === sem);
    if (list.length < curriculumCourses.length) for (const r of list) r.messages.push(`Only ${list.length} of ${curriculumCourses.length} courses of semester ${sem} are in the file`);
    const pts = list.map((r) => {
      const c = curriculumCourses.find((x) => x.code === r.data.course_code)!;
      const point = r.data.grade === grading.failGrade ? grading.failPoint : grading.bands.find((b) => b.grade === r.data.grade)!.point;
      return { credits: c.credits, point };
    });
    const credits = pts.reduce((a, p) => a + p.credits, 0);
    const sgpa = Math.round((pts.reduce((a, p) => a + p.credits * p.point, 0) / credits) * 100) / 100;
    const source = list.find((r) => r.data.sgpa)?.data.sgpa;
    if (source && Math.abs(Number(source) - sgpa) > 0.01) for (const r of list) r.messages.push(`Source SGPA ${source} differs from ${sgpa.toFixed(2)} recomputed from the grades — recomputed value recorded`);
  }
  return finish(staged);
}

export async function stageImport(kind: string, fileName: string, text: string, actor: Actor) {
  const spec = IMPORT_KINDS[kind];
  if (!spec) return { error: "Choose what you are importing." };
  if (text.length > 900_000) return { error: "The file is larger than 900 KB; split it into parts." };
  const table = parseCsv(text);
  if (table.length < 2) return { error: "The file has no data rows." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = spec.required.filter((c) => !header.includes(c));
  if (missing.length) return { error: `Missing column(s): ${missing.join(", ")}. Download the template for the expected layout.` };
  const rows = table.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()])));
  if (rows.length > 5000) return { error: "At most 5,000 rows per file." };
  const staged = kind === "STUDENTS" ? await validateStudents(rows) : await validateResults(rows);
  const count = (s: string) => staged.filter((r) => r.status === s).length;
  const batch = await db.importBatch.create({
    data: {
      kind, fileName, rowCount: staged.length, validCount: count("VALID"), warningCount: count("WARNING"), errorCount: count("ERROR"), columns: header, createdById: actor.id,
      rows: { create: staged.map((r) => ({ rowNo: r.rowNo, data: r.data, status: r.status, messages: r.messages })) },
    },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "IMPORT_STAGED", entity: "ImportBatch", entityId: batch.id,
    summary: `${spec.label} — ${fileName}: ${staged.length} rows staged (${batch.validCount} valid, ${batch.warningCount} with warnings, ${batch.errorCount} with errors)`,
  });
  return { ok: true, id: batch.id };
}

export async function commitImport(batchId: string, actor: Actor) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId }, include: { rows: { orderBy: { rowNo: "asc" } } } });
  if (!batch || batch.status !== "STAGED") return { error: "This import is not awaiting commit." };
  const rows = batch.rows.filter((r) => r.status !== "ERROR");
  if (!rows.length) return { error: "No clean rows to write — fix the file and upload it again." };
  let written = 0;
  if (batch.kind === "STUDENTS") {
    const batches = await db.batch.findMany();
    for (const r of rows) {
      const d = r.data as Row;
      const b = batches.find((x) => x.code === d.batch_code)!;
      const s = await db.student.create({
        data: {
          uid: d.uid, rollNo: d.roll_no, name: d.name, gender: d.gender, dob: d.dob ? new Date(d.dob) : null,
          email: d.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) ? d.email : `${d.roll_no.toLowerCase()}@students.nluassam.ac.in`,
          phone: d.phone || null, category: d.category || "GEN", abcId: d.abc_id || null, parentName: d.parent_name || null, batchId: b.id, status: d.status || "ACTIVE",
        },
      });
      await db.importRow.update({ where: { id: r.id }, data: { created: { studentId: s.id } } });
      written++;
    }
  } else {
    const run = await legacyRun();
    const grading = asParams<GradingParams>((await getActiveRule("GRADING"))!);
    const students = await db.student.findMany({ where: { rollNo: { in: rows.map((r) => (r.data as Row).roll_no) } }, include: { batch: { include: { curriculumVersion: { include: { courses: true } } } } } });
    const groups = new Map<string, typeof rows>();
    for (const r of rows) groups.set(`${(r.data as Row).roll_no}|${(r.data as Row).semester}`, [...(groups.get(`${(r.data as Row).roll_no}|${(r.data as Row).semester}`) ?? []), r]);
    const touched = new Set<string>();
    for (const [key, list] of groups) {
      const [roll, semStr] = key.split("|");
      const sem = Number(semStr);
      const s = students.find((x) => x.rollNo === roll)!;
      touched.add(s.id);
      let num = 0;
      let den = 0;
      let earned = 0;
      for (const r of list) {
        const d = r.data as Row;
        const c = s.batch.curriculumVersion.courses.find((x) => x.code === d.course_code)!;
        const fail = d.grade === grading.failGrade;
        const point = fail ? grading.failPoint : grading.bands.find((b) => b.grade === d.grade)!.point;
        const expected = gradeFor(grading, Number(d.marks)).grade;
        const enrol = await db.enrolment.create({ data: { studentId: s.id, courseId: c.id, academicYear: d.academic_year || "legacy", semester: sem, status: "COMPLETED" } });
        const cr = await db.courseResult.create({
          data: {
            runId: run.id, enrolmentId: enrol.id, studentId: s.id, courseId: c.id,
            components: [{ code: "TOTAL", name: "Total (migrated)", max: 100, marks: Number(d.marks), pass: 50, ok: !fail }] as Prisma.InputJsonValue,
            rawTotal: Number(d.marks), total: Number(d.marks), grade: d.grade, gradePoint: point, credits: c.credits, status: fail ? "FAIL" : "PASS",
            flags: expected !== d.grade ? ([{ code: "MIGRATION_GRADE_MISMATCH", detail: `Source grade ${d.grade}; regulation gives ${expected}` }] as Prisma.InputJsonValue) : undefined,
          },
        });
        num += c.credits * point;
        den += c.credits;
        if (!fail) earned += c.credits;
        await db.importRow.update({ where: { id: r.id }, data: { created: { enrolmentId: enrol.id, courseResultId: cr.id } } });
        written++;
      }
      const sr = await db.semesterResult.create({
        data: { runId: run.id, studentId: s.id, semester: sem, credits: den, earnedCredits: earned, sgpa: Math.round((num / den) * 100) / 100, cgpa: 0, result: earned === den ? "PASS" : "FAIL" },
      });
      const first = await db.importRow.findUniqueOrThrow({ where: { id: list[0].id } });
      await db.importRow.update({ where: { id: first.id }, data: { created: { ...(first.created as Record<string, string>), semesterResultId: sr.id } } });
    }
    for (const id of touched) await recomputeLegacyCgpa(id, run.id);
  }
  await db.importBatch.update({ where: { id: batch.id }, data: { status: "COMMITTED", committedAt: new Date() } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "IMPORT_COMMITTED", entity: "ImportBatch", entityId: batch.id,
    summary: `${IMPORT_KINDS[batch.kind].label} — ${batch.fileName}: ${written} row(s) written${batch.errorCount ? `, ${batch.errorCount} row(s) with errors left out` : ""}`,
  });
  return { ok: true, written };
}

async function recomputeLegacyCgpa(studentId: string, runId: string) {
  const sems = await db.semesterResult.findMany({ where: { studentId, runId }, orderBy: { semester: "asc" } });
  let num = 0;
  let den = 0;
  for (const s of sems) {
    num += s.sgpa * s.credits;
    den += s.credits;
    await db.semesterResult.update({ where: { id: s.id }, data: { cgpa: Math.round((num / den) * 100) / 100 } });
  }
}

export async function rollbackImport(batchId: string, actor: Actor) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId }, include: { rows: true } });
  if (!batch || batch.status !== "COMMITTED") return { error: "Only a committed import can be rolled back." };
  const created = batch.rows.map((r) => r.created as Record<string, string> | null).filter((c): c is Record<string, string> => !!c);
  if (batch.kind === "STUDENTS") {
    const ids = created.map((c) => c.studentId);
    const used = await db.student.findMany({ where: { id: { in: ids }, OR: [{ enrolments: { some: {} } }, { documents: { some: {} } }, { user: { isNot: null } }] }, select: { rollNo: true } });
    if (used.length) return { error: `${used.length} imported student(s) now have results or documents (e.g. ${used[0].rollNo}) — roll back the results import first.` };
    await db.student.deleteMany({ where: { id: { in: ids } } });
  } else {
    const run = await legacyRun();
    const studentIds = (await db.courseResult.findMany({ where: { id: { in: created.map((c) => c.courseResultId) } }, select: { studentId: true } })).map((x) => x.studentId);
    await db.courseResult.deleteMany({ where: { id: { in: created.map((c) => c.courseResultId) } } });
    await db.semesterResult.deleteMany({ where: { id: { in: created.map((c) => c.semesterResultId).filter(Boolean) } } });
    await db.enrolment.deleteMany({ where: { id: { in: created.map((c) => c.enrolmentId) } } });
    for (const id of new Set(studentIds)) await recomputeLegacyCgpa(id, run.id);
  }
  await db.importBatch.update({ where: { id: batch.id }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "IMPORT_ROLLED_BACK", entity: "ImportBatch", entityId: batch.id, summary: `${IMPORT_KINDS[batch.kind].label} — ${batch.fileName}: import rolled back (${created.length} row(s) removed)` });
  return { ok: true };
}

export async function errorReport(batchId: string) {
  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { rows: { orderBy: { rowNo: "asc" } } } });
  return toCsv([
    ["row", ...batch.columns, "status", "messages"],
    ...batch.rows.filter((r) => r.status !== "VALID").map((r) => [r.rowNo, ...batch.columns.map((c) => (r.data as Row)[c] ?? ""), r.status, r.messages.join(" | ")]),
  ]);
}

/** Demo files: a legacy export from the 2020–25 B.A. LL.B. batch with a few deliberate problems. */
export async function sampleCsv(kind: string) {
  const r = rng(20200801);
  const names = ["Abhishek Barua", "Bornali Hazarika", "Chinmoy Sarmah", "Darshana Gogoi", "Eshan Ali", "Farhana Begum", "Gautam Rajkhowa", "Hiyashree Das", "Indrani Bhuyan"];
  if (kind === "STUDENTS") {
    const rows: (string | number)[][] = names.map((n, i) => {
      const roll = `BAL20-${String(i + 1).padStart(3, "0")}`;
      const first = n.split(" ")[0].toLowerCase();
      return [`NLUJA2020${String(9101 + i)}`, roll, n, i % 2 ? "F" : "M", `2002-${String((i % 12) + 1).padStart(2, "0")}-${String(4 + i).padStart(2, "0")}`, `${first}.${roll.toLowerCase()}@students.nluassam.ac.in`, `98540${String(31000 + i * 77)}`, ["GEN", "OBC", "SC", "ST", "GEN", "EWS"][i % 6], `ABC${String(390000000000 + i * 4111)}`, `${i % 2 ? "Mr." : "Mrs."} ${n.split(" ").at(-1)}`, "BALLB-2020", "GRADUATED"];
    });
    rows[2][8] = "";
    rows[4][5] = "eshan.ali@students";
    rows[6][1] = "BAL22-001";
    rows[7][10] = "BALLB-2019";
    rows[8][4] = "2002-02-31";
    return toCsv([IMPORT_KINDS.STUDENTS.columns, ...rows]);
  }
  const grading = asParams<GradingParams>((await getActiveRule("GRADING"))!);
  const cur = await db.curriculumVersion.findUniqueOrThrow({ where: { code: "BALLB-CUR-2019" }, include: { courses: { where: { semester: { in: [1, 2] } }, orderBy: { code: "asc" } } } });
  const rows: (string | number)[][] = [];
  for (let i = 0; i < 6; i++) {
    const roll = `BAL20-${String(i + 1).padStart(3, "0")}`;
    for (const sem of [1, 2]) {
      const list = cur.courses.filter((c) => c.semester === sem);
      const marks = list.map(() => Math.round(58 + r() * 32));
      const pts = marks.map((m) => gradeFor(grading, m));
      const sgpa = Math.round((pts.reduce((a, p, k) => a + p.point * list[k].credits, 0) / list.reduce((a, c) => a + c.credits, 0)) * 100) / 100;
      list.forEach((c, k) => rows.push([roll, sem, sem === 1 ? "2020-21" : "2020-21", c.code, marks[k], pts[k].grade, c.credits, i === 2 && sem === 2 ? (sgpa + 0.35).toFixed(2) : sgpa.toFixed(2)]));
    }
  }
  const at = (roll: string, code: string) => rows.find((x) => x[0] === roll && x[3] === code)!;
  const g = at("BAL20-002", cur.courses[1].code);
  g[5] = grading.bands.find((b) => b.grade !== g[5])!.grade;
  at("BAL20-001", cur.courses[0].code)[6] = 4;
  at("BAL20-005", cur.courses.filter((c) => c.semester === 2)[1].code)[4] = 105;
  rows.push(["BAL20-004", 1, "2020-21", "BL1.9", 71, gradeFor(grading, 71).grade, 5, ""]);
  rows.push(["BAL20-009", 1, "2020-21", cur.courses[0].code, 66, gradeFor(grading, 66).grade, 5, ""]);
  return toCsv([IMPORT_KINDS.RESULTS.columns, ...rows]);
}
