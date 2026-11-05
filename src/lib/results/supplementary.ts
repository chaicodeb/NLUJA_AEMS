import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { asParams, gradeFor, round, type GradingParams } from "../rules/engine";
import { getActiveRule } from "../rules/store";
import { assessPass, semesterRow, summariseRun, type ComponentResult, type CourseRow, type Flag } from "./engine";

export type SupplementaryParams = { feePerPaper: number; improvementMaxGrade: string; maxImprovementPapers: number; backlogGradeCap: string | null; improvementPolicy: string };
type Actor = { id: string; role: string };

export const SUPPLEMENTARY_TYPE = "REPEAT" as const;

async function rules() {
  const [sup, grading] = await Promise.all([getActiveRule("SUPPLEMENTARY"), getActiveRule("GRADING")]);
  return sup && grading ? { sup, p: asParams<SupplementaryParams>(sup), gradingRule: grading, grading: asParams<GradingParams>(grading) } : null;
}

const pointOf = (grading: GradingParams, grade: string) => grading.bands.find((b) => b.grade === grade)?.point ?? 0;

/** The published regular result the supplementary examination builds on. */
async function baseRun(academicYear?: string) {
  return db.resultRun.findFirst({
    where: { status: "PUBLISHED", exam: { type: "REGULAR", code: { not: "LEGACY-MIGRATION" }, ...(academicYear ? { academicYear } : {}) } },
    orderBy: { publishedAt: "desc" },
    include: { exam: { include: { papers: true } } },
  });
}

export async function currentSupplementary() {
  return db.exam.findFirst({ where: { type: SUPPLEMENTARY_TYPE }, orderBy: { startDate: "desc" }, include: { papers: { include: { course: true }, orderBy: { date: "asc" } } } });
}

export async function createSupplementaryExam(actor: Actor) {
  const cfg = await rules();
  if (!cfg) return { error: "Configure the supplementary-examination and grading rules first." };
  const base = await baseRun();
  if (!base) return { error: "The regular examination's results must be published first." };
  if (await db.exam.findFirst({ where: { type: SUPPLEMENTARY_TYPE, academicYear: base.exam.academicYear } })) return { error: "A supplementary examination already exists for this session." };
  const start = new Date(base.exam.endDate.getTime() + 37 * 86400000);
  const exam = await db.exam.create({
    data: {
      code: base.exam.code.replace(/^ESE/, "SUP"), name: `Supplementary Examination (Backlog & Improvement), ${base.exam.parity === "ODD" ? "Odd" : "Even"} Semester ${base.exam.academicYear}`,
      type: SUPPLEMENTARY_TYPE, academicYear: base.exam.academicYear, parity: base.exam.parity, status: "REGISTRATION", registrationOpen: true,
      startDate: start, endDate: new Date(start.getTime() + 12 * 86400000), feeAmount: cfg.p.feePerPaper,
    },
  });
  const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let last = "";
  for (const p of [...base.exam.papers].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const sameDay = p.date.toISOString().slice(0, 10) === last;
    last = p.date.toISOString().slice(0, 10);
    if (!sameDay) {
      day.setUTCDate(day.getUTCDate() + 1);
      while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
    }
    const at = new Date(day);
    at.setUTCHours(p.date.getUTCHours(), p.date.getUTCMinutes());
    await db.examPaper.create({
      data: {
        examId: exam.id, courseId: p.courseId, date: at, session: p.session, durationMins: p.durationMins,
        maxMarks: p.maxMarks, questionScheme: p.questionScheme ?? undefined, setterId: p.setterId, evaluationMode: "SINGLE",
      },
    });
  }
  await audit({ actorId: actor.id, actorRole: actor.role, action: "CREATE_EXAM", entity: "Exam", entityId: exam.id, summary: `${exam.name} created with ${base.exam.papers.length} papers; registration opened for backlog and improvement candidates`, after: { code: exam.code, rule: `${cfg.sup.key} v${cfg.sup.version}` } });
  return { ok: true, examId: exam.id };
}

export type SupOption = { paperId: string; code: string; title: string; status: string; grade: string; total: number; max: number; kind: "BACKLOG" | "IMPROVEMENT" | null; reason: string };

/** What a student may take: failed/absent papers as backlog, low passing grades as improvement; shortage cases must repeat the course. */
export async function supplementaryOptions(studentId: string, examId: string) {
  const [cfg, exam] = await Promise.all([rules(), db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: true } })]);
  if (!cfg) return null;
  const base = await baseRun(exam.academicYear);
  if (!base) return null;
  const results = await db.courseResult.findMany({ where: { runId: base.id, studentId }, include: { enrolment: { include: { course: true } } }, orderBy: { enrolment: { course: { code: "asc" } } } });
  const registration = await db.examRegistration.findUnique({ where: { examId_studentId: { examId, studentId } }, include: { papers: { include: { examPaper: { include: { course: true } }, supMark: true } } } });
  const capPoint = pointOf(cfg.grading, cfg.p.improvementMaxGrade);
  const options: SupOption[] = results.map((r) => {
    const paper = exam.papers.find((p) => p.courseId === r.courseId);
    const base = { paperId: paper?.id ?? "", code: r.enrolment.course.code, title: r.enrolment.course.title, status: r.status, grade: r.grade, total: r.total, max: (r.components as unknown as ComponentResult[]).reduce((a, c) => a + c.max, 0) };
    if (!paper) return { ...base, kind: null, reason: "No supplementary paper for this course" };
    if (r.status === "FAIL" || r.status === "AB") return { ...base, kind: "BACKLOG", reason: r.status === "AB" ? "Absent in the regular examination" : "Failed in the regular examination" };
    if (r.status === "NA") return { ...base, kind: null, reason: "Not allowed for attendance shortage — the course must be repeated (re-registration next year)" };
    if (r.status === "W") return { ...base, kind: null, reason: "Result withheld" };
    if (r.gradePoint <= capPoint) return { ...base, kind: "IMPROVEMENT", reason: `Grade ${r.grade} is eligible for improvement (${cfg.p.improvementMaxGrade} or below)` };
    return { ...base, kind: null, reason: `Grade ${r.grade} — above the improvement threshold` };
  });
  return { exam, params: cfg.p, ruleVersion: cfg.sup.version, options, registration };
}

export async function registerSupplementary(studentId: string, examId: string, paperIds: string[], method: string, actor: Actor) {
  const opts = await supplementaryOptions(studentId, examId);
  if (!opts) return { error: "Supplementary registration is not available." };
  if (!opts.exam.registrationOpen) return { error: "Registration for the supplementary examination is closed." };
  if (opts.registration) return { error: "You have already registered for this examination." };
  const chosen = opts.options.filter((o) => o.kind && paperIds.includes(o.paperId));
  if (!chosen.length) return { error: "Select at least one paper." };
  const improvements = chosen.filter((o) => o.kind === "IMPROVEMENT").length;
  if (improvements > opts.params.maxImprovementPapers) return { error: `At most ${opts.params.maxImprovementPapers} papers may be taken for improvement.` };
  const fee = chosen.length * opts.params.feePerPaper;
  const paymentRef = `${method}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const reg = await db.examRegistration.create({
    data: {
      examId, studentId, status: "SUBMITTED", feePaid: true, paymentRef,
      papers: { create: chosen.map((o) => ({ examPaperId: o.paperId, kind: o.kind! })) },
    },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "SUPPLEMENTARY_REGISTERED", entity: "ExamRegistration", entityId: reg.id,
    summary: `Registered for ${chosen.map((o) => `${o.code} (${o.kind === "BACKLOG" ? "backlog" : "improvement"})`).join(", ")}; fee ₹${fee} paid (${paymentRef})`,
  });
  return { ok: true, fee };
}

// ─── Award lists ─────────────────────────────────────────────────────

export async function awardList(paperId: string) {
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, include: { course: true, exam: true } });
  const rows = await db.registrationPaper.findMany({
    where: { examPaperId: paperId },
    include: { registration: { include: { student: true } }, supMark: true },
    orderBy: { registration: { student: { rollNo: "asc" } } },
  });
  return { paper, rows };
}

export async function saveAwardList(paperId: string, entries: { registrationPaperId: string; marks: number | null; absent: boolean }[], submit: boolean, actor: Actor) {
  if (!["EXAM_STAFF", "COE"].includes(actor.role)) return { error: "Only the Examination Branch can enter award lists." };
  const { paper, rows } = await awardList(paperId);
  if (paper.exam.status === "RESULT" || paper.exam.status === "CLOSED") return { error: "Results have been processed — the award list is locked." };
  if (rows.some((r) => r.supMark?.status === "SUBMITTED")) return { error: "This award list has already been submitted." };
  for (const e of entries) {
    if (!rows.some((r) => r.id === e.registrationPaperId)) return { error: "Unknown candidate in the award list." };
    if (!e.absent && e.marks != null && (e.marks < 0 || e.marks > paper.maxMarks || Math.abs(e.marks * 2 - Math.round(e.marks * 2)) > 1e-9)) return { error: `Marks must be between 0 and ${paper.maxMarks} in steps of 0.5.` };
  }
  if (submit && entries.some((e) => !e.absent && e.marks == null)) return { error: "Enter marks or mark absent for every candidate before submitting." };
  for (const e of entries) {
    await db.supplementaryMark.upsert({
      where: { registrationPaperId: e.registrationPaperId },
      create: { registrationPaperId: e.registrationPaperId, marks: e.absent ? null : e.marks, absent: e.absent, status: submit ? "SUBMITTED" : "DRAFT", enteredById: actor.id },
      update: { marks: e.absent ? null : e.marks, absent: e.absent, status: submit ? "SUBMITTED" : "DRAFT", enteredById: actor.id },
    });
  }
  if (submit) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "AWARD_LIST_SUBMITTED", entity: "ExamPaper", entityId: paperId, summary: `${paper.course.code} supplementary award list submitted: ${entries.length} candidate(s)` });
    if (paper.exam.registrationOpen) await db.exam.update({ where: { id: paper.examId }, data: { registrationOpen: false, status: "EVALUATION" } });
  }
  return { ok: true };
}

// ─── Processing ──────────────────────────────────────────────────────

/** Builds a complete semester result for each candidate: re-attempted courses recomputed, all others carried over from the regular result. */
export async function processSupplementary(examId: string, actor: Actor) {
  const cfg = await rules();
  if (!cfg) return { error: "Supplementary or grading rule missing." };
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId } });
  const base = await baseRun(exam.academicYear);
  if (!base) return { error: "The regular result is not published." };
  const regs = await db.examRegistration.findMany({
    where: { examId },
    include: { papers: { include: { supMark: true, examPaper: { include: { course: { include: { scheme: { include: { components: { orderBy: { sortOrder: "asc" } } } } } } } } } } },
  });
  if (!regs.length) return { error: "No candidates registered." };
  const pendingLists = regs.flatMap((r) => r.papers).filter((p) => p.supMark?.status !== "SUBMITTED");
  if (pendingLists.length) return { error: `${pendingLists.length} award-list entr${pendingLists.length === 1 ? "y is" : "ies are"} not yet submitted.` };

  const courseRows: CourseRow[] = [];
  const semRows: Awaited<ReturnType<typeof semesterRow>>[] = [];
  const changes: string[] = [];
  for (const reg of regs) {
    const baseRows = await db.courseResult.findMany({ where: { runId: base.id, studentId: reg.studentId }, include: { enrolment: true } });
    const rows: CourseRow[] = [];
    for (const b of baseRows) {
      const attempt = reg.papers.find((p) => p.examPaper.courseId === b.courseId);
      const carried: CourseRow = {
        enrolmentId: b.enrolmentId, studentId: b.studentId, courseId: b.courseId, components: b.components as Prisma.InputJsonValue,
        rawTotal: b.rawTotal, grace: b.grace, total: b.total, grade: b.grade, gradePoint: b.gradePoint, credits: b.credits, status: b.status,
        flags: (b.flags ?? []) as Prisma.InputJsonValue,
      };
      if (!attempt) {
        rows.push(carried);
        continue;
      }
      const scheme = attempt.examPaper.course.scheme;
      const endCode = scheme.components.find((c) => c.source === "EXAM")?.code;
      const mark = attempt.supMark!;
      const components = (b.components as unknown as ComponentResult[]).map((c) => {
        const marks = c.code === endCode ? (mark.absent ? null : mark.marks) : c.marks;
        return { ...c, marks, ok: c.pass == null || (marks ?? 0) >= c.pass };
      });
      const max = components.reduce((a, c) => a + c.max, 0);
      const rawTotal = round(components.reduce((a, c) => a + (c.marks ?? 0), 0), 2);
      const verdict = mark.absent ? null : assessPass(components, scheme, rawTotal, max);
      let grade = verdict?.status === "PASS" ? gradeFor(cfg.grading, (rawTotal / max) * 100) : { grade: mark.absent ? "AB" : cfg.grading.failGrade, point: 0 };
      const flags: Flag[] = [];
      if (attempt.kind === "BACKLOG" && verdict?.status === "PASS" && cfg.p.backlogGradeCap && grade.point > pointOf(cfg.grading, cfg.p.backlogGradeCap)) {
        flags.push({ code: "GRADE_CAPPED", detail: `Grade ${grade.grade} capped at ${cfg.p.backlogGradeCap} for a supplementary attempt (${cfg.sup.key} v${cfg.sup.version})` });
        grade = { grade: cfg.p.backlogGradeCap, point: pointOf(cfg.grading, cfg.p.backlogGradeCap) };
      }
      const status = mark.absent ? "AB" : (verdict!.status as string);
      const attempted: CourseRow = {
        ...carried, components: components as unknown as Prisma.InputJsonValue, rawTotal, grace: 0, total: rawTotal, grade: grade.grade, gradePoint: grade.point, status,
        flags: [...flags, ...(verdict?.flags ?? []), { code: "SUPPLEMENTARY", detail: `${attempt.kind === "BACKLOG" ? "Backlog" : "Improvement"} attempt in ${exam.code}: end-semester ${mark.absent ? "absent" : `${mark.marks}`} (regular attempt ${b.total}, ${b.grade})` }] as unknown as Prisma.InputJsonValue,
      };
      let chosen = attempted;
      if (attempt.kind === "IMPROVEMENT" && (status !== "PASS" || rawTotal <= b.total)) {
        chosen = { ...carried, flags: [...((b.flags ?? []) as unknown as Flag[]), { code: "IMPROVEMENT_NOT_BETTER", detail: `Improvement attempt ${mark.absent ? "absent" : `scored ${rawTotal}`}; better regular result (${b.total}, ${b.grade}) retained` }] as unknown as Prisma.InputJsonValue };
      }
      rows.push(chosen);
      changes.push(`${attempt.examPaper.course.code} ${b.grade}→${chosen.grade}`);
    }
    courseRows.push(...rows);
    semRows.push(await semesterRow(reg.studentId, baseRows[0].enrolment.semester, rows, cfg.grading));
  }

  await db.resultRun.updateMany({ where: { examId, status: { in: ["PROCESSED", "APPROVED"] } }, data: { status: "WITHDRAWN" } });
  const run = await db.resultRun.create({
    data: {
      examId, label: `${exam.name} — result run ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, status: "PROCESSED", processedById: actor.id,
      rulesUsed: { grading: { key: cfg.gradingRule.key, version: cfg.gradingRule.version }, grace: null, supplementary: { key: cfg.sup.key, version: cfg.sup.version }, baseRun: base.id },
    },
  });
  await db.courseResult.createMany({ data: courseRows.map((r) => ({ ...r, runId: run.id })) });
  await db.semesterResult.createMany({ data: semRows.map((r) => ({ ...r, runId: run.id })) });
  const summary = await summariseRun(run.id);
  await db.exam.update({ where: { id: examId }, data: { status: "RESULT" } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "RESULTS_PROCESSED", entity: "ResultRun", entityId: run.id,
    summary: `Supplementary results processed for ${regs.length} candidate(s): ${changes.join(", ")}; other courses carried forward from the regular result`,
    after: summary,
  });
  return { ok: true, runId: run.id };
}
