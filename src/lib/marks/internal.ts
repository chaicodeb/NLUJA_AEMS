import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { hashPayload, signHash } from "../docs";
import { sheetStats, validateRows, type RowInput, type SheetRow, type SubCriterion } from "./shared";

export const INTERNAL_SOURCES = ["FACULTY", "EXTERNAL"];
export const VERIFIER_ROLES = ["HOD", "COE"];

type Actor = { id: string; role: string };

const sheetInclude = {
  course: { include: { faculty: true } },
  component: { include: { scheme: true } },
} satisfies Prisma.InternalMarksSheetInclude;

export type SheetWithRelations = Prisma.InternalMarksSheetGetPayload<{ include: typeof sheetInclude }>;

export function subCriteriaOf(component: { subCriteria: Prisma.JsonValue }): SubCriterion[] {
  return Array.isArray(component.subCriteria) ? (component.subCriteria as unknown as SubCriterion[]) : [];
}

export async function loadSheet(id: string) {
  const sheet = await db.internalMarksSheet.findUnique({ where: { id }, include: sheetInclude });
  if (!sheet) return null;
  const enrolments = await db.enrolment.findMany({
    where: { courseId: sheet.courseId, academicYear: sheet.academicYear },
    include: { student: true, markEntries: { where: { componentId: sheet.componentId } } },
    orderBy: { student: { rollNo: "asc" } },
  });
  const rows: SheetRow[] = enrolments.map((e) => {
    const m = e.markEntries[0];
    return {
      enrolmentId: e.id,
      rollNo: e.student.rollNo,
      name: e.student.name,
      marks: m?.absent ? null : (m?.marks ?? null),
      absent: m?.absent ?? false,
      detail: (m?.detail as Record<string, number | null> | null) ?? null,
    };
  });
  return { sheet, rows };
}

export function canEditSheet(sheet: { status: string; course: { facultyId: string | null } }, userId: string) {
  return sheet.course.facultyId === userId && ["DRAFT", "RETURNED"].includes(sheet.status);
}

function normalise(r: RowInput, criteria: SubCriterion[]): RowInput {
  if (r.absent) return { ...r, marks: null, detail: null };
  if (!criteria.length || !r.detail) return { ...r, detail: null };
  const parts = criteria.map((c) => r.detail?.[c.code]);
  const complete = parts.every((v) => v != null);
  return { ...r, detail: Object.fromEntries(criteria.map((c) => [c.code, r.detail?.[c.code] ?? null])), marks: complete ? parts.reduce<number>((a, v) => a + (v ?? 0), 0) : r.marks };
}

export async function saveSheetDraft(sheetId: string, input: RowInput[], actor: Actor) {
  const loaded = await loadSheet(sheetId);
  if (!loaded) return { error: "Marks sheet not found." };
  const { sheet, rows } = loaded;
  if (!canEditSheet(sheet, actor.id)) return { error: sheet.course.facultyId === actor.id ? "This sheet has been submitted and can no longer be edited." : "Only the course teacher can enter these marks." };
  const criteria = subCriteriaOf(sheet.component);
  const known = new Map(rows.map((r) => [r.enrolmentId, r]));
  const clean = input.filter((r) => known.has(r.enrolmentId)).map((r) => normalise(r, criteria));
  const errors = validateRows(clean, sheet.component.maxMarks, criteria, (id) => known.get(id)!.rollNo);
  if (errors.length) return { error: `${errors.length} entr${errors.length === 1 ? "y needs" : "ies need"} correction.`, rowErrors: errors };

  const changed = clean.filter((r) => {
    const cur = known.get(r.enrolmentId)!;
    return cur.marks !== r.marks || cur.absent !== r.absent || JSON.stringify(cur.detail ?? null) !== JSON.stringify(r.detail ?? null);
  });
  await db.$transaction(
    changed.map((r) =>
      db.markEntry.upsert({
        where: { enrolmentId_componentId: { enrolmentId: r.enrolmentId, componentId: sheet.componentId } },
        create: { enrolmentId: r.enrolmentId, componentId: sheet.componentId, marks: r.marks, absent: r.absent, detail: r.detail ?? Prisma.DbNull, status: "DRAFT", source: sheet.component.source, enteredById: actor.id },
        update: { marks: r.marks, absent: r.absent, detail: r.detail ?? Prisma.DbNull, status: "DRAFT", enteredById: actor.id },
      }),
    ),
  );
  return { ok: true, saved: changed.length };
}

function signedPayload(sheet: SheetWithRelations, rows: SheetRow[]) {
  return {
    sheet: sheet.id, course: sheet.course.code, component: sheet.component.code, academicYear: sheet.academicYear,
    rows: rows.map((r) => ({ rollNo: r.rollNo, marks: r.marks, absent: r.absent, detail: r.detail })),
  };
}

export async function sheetSignature(sheetId: string) {
  const loaded = await loadSheet(sheetId);
  return loaded ? signHash(hashPayload(signedPayload(loaded.sheet, loaded.rows))) : null;
}

export async function submitSheet(sheetId: string, actor: Actor) {
  const loaded = await loadSheet(sheetId);
  if (!loaded) return { error: "Marks sheet not found." };
  const { sheet, rows } = loaded;
  if (!canEditSheet(sheet, actor.id)) return { error: "Only the course teacher can submit a draft sheet." };
  const missing = rows.filter((r) => !r.absent && r.marks == null);
  if (missing.length) return { error: `Marks are missing for ${missing.length} student(s): ${missing.map((r) => r.rollNo).join(", ")}. Enter marks or mark them absent.` };
  const signature = signHash(hashPayload(signedPayload(sheet, rows)));
  const at = new Date();
  await db.$transaction([
    db.markEntry.updateMany({ where: { componentId: sheet.componentId, enrolment: { courseId: sheet.courseId, academicYear: sheet.academicYear } }, data: { status: "SUBMITTED" } }),
    db.internalMarksSheet.update({ where: { id: sheetId }, data: { status: "SUBMITTED", submittedById: actor.id, submittedAt: at, signatureHash: signature, note: null } }),
  ]);
  const stats = sheetStats(rows, sheet.component.maxMarks, sheet.component.passMarks);
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "INTERNAL_MARKS_SUBMITTED", entity: "InternalMarksSheet", entityId: sheetId,
    summary: `${sheet.course.code} ${sheet.component.name}: ${rows.length} students submitted and signed (mean ${stats.mean ?? "—"}/${sheet.component.maxMarks})`,
    after: { students: rows.length, absent: stats.absent, mean: stats.mean, signature: signature.slice(0, 16) },
  });
  return { ok: true, signature };
}

export async function verifySheet(sheetId: string, actor: Actor) {
  if (!VERIFIER_ROLES.includes(actor.role)) return { error: "Only the Head of Department or the Controller of Examinations can verify marks." };
  const loaded = await loadSheet(sheetId);
  if (!loaded) return { error: "Marks sheet not found." };
  const { sheet, rows } = loaded;
  if (sheet.status !== "SUBMITTED") return { error: "Only submitted sheets can be verified." };
  if (sheet.submittedById === actor.id) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "SEGREGATION_VIOLATION_BLOCKED", entity: "InternalMarksSheet", entityId: sheetId, summary: `Blocked: ${sheet.course.code} ${sheet.component.code} verified by its own submitter` });
    return { error: "The teacher who submitted the marks cannot verify them." };
  }
  if (signHash(hashPayload(signedPayload(sheet, rows))) !== sheet.signatureHash) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "INTEGRITY_CHECK_FAILED", entity: "InternalMarksSheet", entityId: sheetId, summary: `${sheet.course.code} ${sheet.component.code}: marks differ from the teacher's signed submission` });
    return { error: "Marks have changed since the teacher signed the sheet. Return it to the teacher for re-submission." };
  }
  await db.$transaction([
    db.markEntry.updateMany({ where: { componentId: sheet.componentId, enrolment: { courseId: sheet.courseId, academicYear: sheet.academicYear } }, data: { status: "LOCKED" } }),
    db.internalMarksSheet.update({ where: { id: sheetId }, data: { status: "VERIFIED", verifiedById: actor.id, verifiedAt: new Date() } }),
  ]);
  await audit({ actorId: actor.id, actorRole: actor.role, action: "INTERNAL_MARKS_VERIFIED", entity: "InternalMarksSheet", entityId: sheetId, summary: `${sheet.course.code} ${sheet.component.name} verified and locked for result processing (signature intact)` });
  return { ok: true };
}

export async function returnSheet(sheetId: string, note: string, actor: Actor) {
  if (!VERIFIER_ROLES.includes(actor.role)) return { error: "Only the Head of Department or the Controller of Examinations can return marks." };
  if (!note.trim()) return { error: "Give the teacher a reason for returning the sheet." };
  const sheet = await db.internalMarksSheet.findUniqueOrThrow({ where: { id: sheetId }, include: sheetInclude });
  if (sheet.status !== "SUBMITTED") return { error: "Only submitted sheets can be returned." };
  await reopen(sheet, note);
  await audit({ actorId: actor.id, actorRole: actor.role, action: "INTERNAL_MARKS_RETURNED", entity: "InternalMarksSheet", entityId: sheetId, summary: `${sheet.course.code} ${sheet.component.name} returned to ${sheet.course.faculty?.name}: ${note}` });
  return { ok: true };
}

/** Unlocks verified marks; refused once the semester's results are published (changes then go through revaluation / moderation). */
export async function reopenSheet(sheetId: string, reason: string, actor: Actor) {
  if (actor.role !== "COE") return { error: "Only the Controller of Examinations can unlock verified marks." };
  if (!reason.trim()) return { error: "A reason is required to unlock verified marks." };
  const sheet = await db.internalMarksSheet.findUniqueOrThrow({ where: { id: sheetId }, include: sheetInclude });
  if (sheet.status !== "VERIFIED") return { error: "Only verified sheets can be unlocked." };
  const published = await db.resultRun.findFirst({ where: { status: "PUBLISHED", exam: { academicYear: sheet.academicYear, code: { not: "LEGACY-MIGRATION" } } } });
  if (published) return { error: "Results for this semester are already published — marks can now change only through revaluation or moderation." };
  await reopen(sheet, `Unlocked by COE: ${reason}`);
  await audit({ actorId: actor.id, actorRole: actor.role, action: "INTERNAL_MARKS_REOPENED", entity: "InternalMarksSheet", entityId: sheetId, summary: `${sheet.course.code} ${sheet.component.name} unlocked for correction: ${reason}` });
  return { ok: true };
}

async function reopen(sheet: SheetWithRelations, note: string) {
  await db.$transaction([
    db.markEntry.updateMany({ where: { componentId: sheet.componentId, enrolment: { courseId: sheet.courseId, academicYear: sheet.academicYear } }, data: { status: "DRAFT" } }),
    db.internalMarksSheet.update({ where: { id: sheet.id }, data: { status: "RETURNED", note, signatureHash: null, verifiedById: null, verifiedAt: null } }),
  ]);
}

export async function remindTeacher(sheetId: string, actor: Actor) {
  const sheet = await db.internalMarksSheet.findUniqueOrThrow({ where: { id: sheetId }, include: sheetInclude });
  if (!["DRAFT", "RETURNED"].includes(sheet.status)) return { error: "This sheet has already been submitted." };
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "REMINDER_SENT", entity: "InternalMarksSheet", entityId: sheetId,
    summary: `Reminder (SMS + e-mail) to ${sheet.course.faculty?.name}: ${sheet.course.code} ${sheet.component.name} due ${sheet.deadline.toLocaleDateString("en-IN")}`,
  });
  return { ok: true, to: sheet.course.faculty?.name ?? "the teacher" };
}

// ─── Excel template and import ───────────────────────────────────────

const HEAD = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF843F13" } } };
const FIRST_ROW = 6;

export async function buildTemplate(sheetId: string) {
  const loaded = await loadSheet(sheetId);
  if (!loaded) return null;
  const { sheet, rows } = loaded;
  const criteria = subCriteriaOf(sheet.component);
  const wb = new ExcelJS.Workbook();
  wb.creator = "NLUJA AEMS";
  const ws = wb.addWorksheet("Marks");
  ws.getCell("A1").value = "National Law University and Judicial Academy, Assam — Internal assessment marks";
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `${sheet.course.code} ${sheet.course.title} · ${sheet.component.name} (max ${sheet.component.maxMarks}) · ${sheet.academicYear}`;
  ws.getCell("A3").value = `Sheet ${sheet.id} · Teacher: ${sheet.course.faculty?.name ?? "—"} · Enter marks in steps of 0.5; write Y under Absent for absentees. Do not change roll numbers.`;
  ws.getCell("A3").font = { italic: true, color: { argb: "FF666666" } };

  const cols = [
    { header: "Roll No", width: 14 },
    { header: "Student", width: 26 },
    ...criteria.map((c) => ({ header: `${c.code} (${c.max})`, width: 12 })),
    { header: `Marks (${sheet.component.maxMarks})`, width: 12 },
    { header: "Absent (Y/N)", width: 12 },
  ];
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  const head = ws.getRow(FIRST_ROW - 1);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = HEAD.font;
    cell.fill = HEAD.fill;
  });
  rows.forEach((r, i) => {
    const row = ws.getRow(FIRST_ROW + i);
    row.getCell(1).value = r.rollNo;
    row.getCell(2).value = r.name;
    criteria.forEach((c, j) => {
      const cell = row.getCell(3 + j);
      cell.value = r.detail?.[c.code] ?? null;
      cell.dataValidation = { type: "decimal", operator: "between", formulae: [0, c.max], allowBlank: true, showErrorMessage: true, error: `0 to ${c.max}` };
    });
    const marksCell = row.getCell(3 + criteria.length);
    if (criteria.length) {
      const from = ws.getColumn(3).letter;
      const to = ws.getColumn(2 + criteria.length).letter;
      marksCell.value = { formula: `IF(COUNT(${from}${FIRST_ROW + i}:${to}${FIRST_ROW + i})=${criteria.length},SUM(${from}${FIRST_ROW + i}:${to}${FIRST_ROW + i}),"")` };
    } else {
      marksCell.value = r.marks;
      marksCell.dataValidation = { type: "decimal", operator: "between", formulae: [0, sheet.component.maxMarks], allowBlank: true, showErrorMessage: true, error: `0 to ${sheet.component.maxMarks}` };
    }
    const abs = row.getCell(4 + criteria.length);
    abs.value = r.absent ? "Y" : null;
    abs.dataValidation = { type: "list", formulae: ['"Y,N"'], allowBlank: true };
  });
  ws.views = [{ state: "frozen", ySplit: FIRST_ROW - 1 }];
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${sheet.course.code}_${sheet.component.code}_${sheet.academicYear}.xlsx` };
}

const cellNumber = (v: ExcelJS.CellValue): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in v) return typeof v.result === "number" ? v.result : null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

export async function importSheet(sheetId: string, file: ArrayBuffer, actor: Actor) {
  const loaded = await loadSheet(sheetId);
  if (!loaded) return { error: "Marks sheet not found." };
  const { sheet, rows } = loaded;
  if (!canEditSheet(sheet, actor.id)) return { error: "Only the course teacher can import marks into a draft sheet." };
  const criteria = subCriteriaOf(sheet.component);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file);
  } catch {
    return { error: "The file could not be read. Upload the Excel template downloaded from this page." };
  }
  const ws = wb.worksheets[0];
  let headRow = 0;
  ws.eachRow((row, n) => {
    if (!headRow && String(row.getCell(1).value ?? "").trim().toLowerCase() === "roll no") headRow = n;
  });
  if (!headRow) return { error: "No 'Roll No' column found. Use the template downloaded from this page." };
  const head = ws.getRow(headRow);
  const colOf = (prefix: string) => {
    for (let i = 1; i <= head.cellCount; i++) if (String(head.getCell(i).value ?? "").trim().toUpperCase().startsWith(prefix)) return i;
    return -1;
  };
  const marksCol = colOf("MARKS");
  const absentCol = colOf("ABSENT");
  const critCols = criteria.map((c) => ({ c, col: colOf(c.code) }));

  const byRoll = new Map(rows.map((r) => [r.rollNo.toUpperCase(), r]));
  const input: RowInput[] = [];
  const problems: string[] = [];
  ws.eachRow((row, n) => {
    if (n <= headRow) return;
    const roll = String(row.getCell(1).value ?? "").trim().toUpperCase();
    if (!roll) return;
    const target = byRoll.get(roll);
    if (!target) return void problems.push(`Row ${n}: roll number ${roll} is not enrolled in ${sheet.course.code}`);
    const absent = absentCol > 0 && String(row.getCell(absentCol).value ?? "").trim().toUpperCase().startsWith("Y");
    const detail = criteria.length ? Object.fromEntries(critCols.map(({ c, col }) => [c.code, col > 0 ? cellNumber(row.getCell(col).value) : null])) : null;
    const marks = marksCol > 0 ? cellNumber(row.getCell(marksCol).value) : null;
    if ([marks, ...Object.values(detail ?? {})].some((v) => Number.isNaN(v))) return void problems.push(`Row ${n} (${roll}): marks must be numbers`);
    input.push({ enrolmentId: target.enrolmentId, absent, marks, detail });
  });
  if (problems.length) return { error: `Nothing imported — ${problems.length} problem(s) in the file.`, problems };
  const res = await saveSheetDraft(sheetId, input, actor);
  if ("error" in res) return { error: res.error, problems: res.rowErrors?.map((e) => `${e.rollNo}: ${e.message}`) };
  await audit({ actorId: actor.id, actorRole: actor.role, action: "INTERNAL_MARKS_IMPORTED", entity: "InternalMarksSheet", entityId: sheetId, summary: `${sheet.course.code} ${sheet.component.name}: ${input.length} rows imported from Excel (${res.saved} changed)` });
  return { ok: true, imported: input.length, changed: res.saved };
}
