import type { Prisma, RuleSet } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { asParams, divisionFor, gradeFor, round, type GraceParams, type GradingParams } from "../rules/engine";
import { UFM_PENALTIES } from "../exams/ufm-shared";
import { getActiveRule } from "../rules/store";
import { INTERNAL_SOURCES } from "../marks/internal";

export type ComponentResult = { code: string; name: string; max: number; marks: number | null; pass: number | null; ok: boolean };
export type Flag = { code: string; detail: string };
export type CourseStatus = "PASS" | "FAIL" | "AB" | "NA" | "W";
export type RulesUsed = { grading: { key: string; version: number }; grace: { key: string; version: number } | null; schemes?: string[] };

type Draft = {
  enrolmentId: string; studentId: string; courseId: string; code: string; title: string; credits: number; semester: number;
  components: ComponentResult[]; rawTotal: number; max: number; status: CourseStatus; flags: Flag[];
  aggregateShortfall: number; componentFail: boolean;
};

export type CourseRow = Omit<Prisma.CourseResultCreateManyInput, "runId">;

type Ctx = {
  exam: Prisma.ExamGetPayload<{ include: { papers: true } }>;
  gradingRule: RuleSet;
  grading: GradingParams;
  graceRule: RuleSet | null;
  grace: GraceParams | null;
  regs: Prisma.RegistrationPaperGetPayload<{ include: { registration: true } }>[];
  scripts: Prisma.AnswerScriptGetPayload<object>[];
  ufm: Prisma.MalpracticeCaseGetPayload<object>[];
};

const enrolmentInclude = (examId: string) =>
  ({
    course: { include: { scheme: { include: { components: { orderBy: { sortOrder: "asc" as const } } } } } },
    markEntries: true,
    eligibilities: { where: { examId } },
  }) satisfies Prisma.EnrolmentInclude;

type EnrolmentRow = Prisma.EnrolmentGetPayload<{ include: ReturnType<typeof enrolmentInclude> }>;

/** Loads the rule set versions — the active ones for a new run, or the exact versions recorded in an existing run. */
async function loadCtx(examId: string, rules?: RulesUsed): Promise<Ctx | null> {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: true } });
  const gradingRule = rules
    ? await db.ruleSet.findUnique({ where: { key_version: { key: rules.grading.key, version: rules.grading.version } } })
    : await getActiveRule("GRADING");
  if (!gradingRule) return null;
  const graceRule = rules
    ? rules.grace ? await db.ruleSet.findUnique({ where: { key_version: { key: rules.grace.key, version: rules.grace.version } } }) : null
    : await getActiveRule("GRACE");
  const [regs, scripts, ufm] = await Promise.all([
    db.registrationPaper.findMany({ where: { registration: { examId } }, include: { registration: true } }),
    db.answerScript.findMany({ where: { examPaper: { examId } } }),
    db.malpracticeCase.findMany({ where: { examPaperId: { in: exam.papers.map((p) => p.id) } } }),
  ]);
  return {
    exam, gradingRule, grading: asParams<GradingParams>(gradingRule), graceRule, grace: graceRule ? asParams<GraceParams>(graceRule) : null, regs, scripts, ufm,
  };
}

/** Pass rule of an evaluation scheme: aggregate pass mark, plus every component minimum under COMPONENT_AND_AGGREGATE. */
export function assessPass(components: ComponentResult[], scheme: { passRule: string; aggregatePassPct: number }, rawTotal: number, max: number) {
  const flags: Flag[] = [];
  let status: "PASS" | "FAIL" = "PASS";
  let componentFail = false;
  let aggregateShortfall = 0;
  const passMark = (max * scheme.aggregatePassPct) / 100;
  const failedComponents = scheme.passRule === "COMPONENT_AND_AGGREGATE" ? components.filter((c) => !c.ok) : [];
  if (failedComponents.length) {
    componentFail = true;
    status = "FAIL";
    for (const c of failedComponents) flags.push({ code: "COMPONENT_FAIL", detail: `${c.name}: ${c.marks ?? 0}/${c.max} below minimum ${c.pass}` });
    if (rawTotal >= passMark) flags.push({ code: "AGGREGATE_PASS_COMPONENT_FAIL", detail: `Aggregate ${rawTotal}/${max} meets ${passMark}, but a component minimum was not met` });
  }
  if (rawTotal < passMark) {
    status = "FAIL";
    aggregateShortfall = round(passMark - rawTotal, 2);
    flags.push({ code: "AGGREGATE_FAIL", detail: `${rawTotal}/${max} below pass mark ${passMark}` });
  }
  return { status, flags, componentFail, aggregateShortfall, passMark };
}

function draftFor(e: EnrolmentRow, ctx: Ctx): Draft {
  const paper = ctx.exam.papers.find((p) => p.courseId === e.courseId);
  const flags: Flag[] = [];
  const scheme = e.course.scheme;
  const max = scheme.components.reduce((a, c) => a + c.maxMarks, 0);
  const unsubmitted = scheme.components.filter((c) => {
    if (!INTERNAL_SOURCES.includes(c.source)) return false;
    const m = e.markEntries.find((x) => x.componentId === c.id);
    return !m || m.status === "DRAFT" || (m.marks == null && !m.absent);
  });
  let moderated = 0;
  const components: ComponentResult[] = scheme.components.map((c) => {
    const m = e.markEntries.find((x) => x.componentId === c.id);
    let marks = m?.absent || unsubmitted.includes(c) ? null : m?.marks ?? null;
    if (marks != null && m?.moderation) {
      const raised = Math.min(c.maxMarks, marks + m.moderation);
      moderated = round(raised - marks, 2);
      marks = raised;
    }
    return { code: c.code, name: c.name, max: c.maxMarks, marks, pass: c.passMarks, ok: c.passMarks == null || (marks ?? 0) >= c.passMarks };
  });
  if (moderated) flags.push({ code: "MODERATED", detail: `+${moderated} added to the end-semester mark by approved paper moderation` });
  const rawTotal = round(components.reduce((a, c) => a + (c.marks ?? 0), 0), 2);
  let status: CourseStatus = "PASS";

  if (paper) {
    const elig = e.eligibilities[0];
    const registered = ctx.regs.some((r) => r.examPaperId === paper.id && r.registration.studentId === e.studentId);
    const script = ctx.scripts.find((s) => s.examPaperId === paper.id && s.studentId === e.studentId);
    const endEntry = e.markEntries.find((m) => scheme.components.some((c) => c.id === m.componentId && c.source === "EXAM"));
    if (elig && !["ELIGIBLE", "RELAXED"].includes(elig.status)) {
      status = "NA";
      flags.push({ code: "NOT_ALLOWED", detail: elig.reason ?? "Attendance shortfall" });
    } else if (!registered) {
      status = "AB";
      flags.push({ code: "NOT_REGISTERED", detail: "Did not register for the examination" });
    } else if (endEntry?.absent) {
      status = "AB";
      flags.push({ code: "ABSENT", detail: "Absent in the end-semester examination" });
    } else if (script && script.status !== "FINALISED") {
      status = "W";
      flags.push({ code: "EVALUATION_PENDING", detail: `Script ${script.dummyNo} — evaluation ${script.status === "THIRD_EVALUATION" ? "awaiting third evaluator" : "pending"}` });
    } else if (!endEntry || endEntry.marks == null) {
      status = "W";
      flags.push({ code: "MARKS_MISSING", detail: "End-semester marks not received" });
    }
    // Unfair means: a pending case withholds the paper; a cancellation (this paper or the whole examination) fails it.
    if (status === "PASS" || status === "W") {
      const own = ctx.ufm.filter((c) => c.studentId === e.studentId);
      const here = own.find((c) => c.examPaperId === paper.id);
      const examWide = own.find((c) => c.status === "DECIDED" && UFM_PENALTIES[c.penalty ?? ""]?.result === "EXAM");
      if (here && here.status !== "DECIDED") {
        status = "W";
        flags.push({ code: "UFM_PENDING", detail: "Result withheld — unfair-means case before the committee" });
      } else if (examWide || (here && UFM_PENALTIES[here.penalty ?? ""]?.result === "PAPER")) {
        status = "FAIL";
        flags.push({ code: "UFM_PENALTY", detail: UFM_PENALTIES[(examWide ?? here)!.penalty!].effect });
      }
    }
  }
  if (status === "PASS" && unsubmitted.length) {
    status = "W";
    flags.push({ code: "INTERNAL_PENDING", detail: `Internal assessment not submitted by the teacher: ${unsubmitted.map((c) => c.name).join(", ")}` });
  }
  if (status === "PASS" && !paper && components.some((c) => c.marks == null)) {
    status = "W";
    flags.push({ code: "MARKS_MISSING", detail: "Internal assessment marks incomplete" });
  }

  let aggregateShortfall = 0;
  let componentFail = false;
  if (status === "PASS") {
    const verdict = assessPass(components, scheme, rawTotal, max);
    status = verdict.status;
    aggregateShortfall = verdict.aggregateShortfall;
    componentFail = verdict.componentFail;
    flags.push(...verdict.flags);
  }
  return {
    enrolmentId: e.id, studentId: e.studentId, courseId: e.courseId, code: e.course.code, title: e.course.title, credits: e.course.credits, semester: e.semester,
    components, rawTotal, max, status, flags, aggregateShortfall, componentFail,
  };
}

/** Grace marks for one student: within configured limits, smallest shortfall first, only where it secures a pass. */
function applyGrace(list: Draft[], ctx: Ctx, out: Map<string, number>) {
  const { grace, graceRule } = ctx;
  if (!grace?.enabled || !graceRule) return;
  let used = 0;
  let courses = 0;
  for (const d of list.filter((x) => x.status === "FAIL" && !x.componentFail && x.aggregateShortfall > 0).sort((a, b) => a.aggregateShortfall - b.aggregateShortfall)) {
    const need = Math.ceil(d.aggregateShortfall);
    if (need <= grace.maxPerCourse && used + need <= grace.maxPerSemester && courses < grace.maxCourses) {
      used += need;
      courses++;
      out.set(d.enrolmentId, need);
      d.status = "PASS";
      d.flags = d.flags.filter((f) => f.code !== "AGGREGATE_FAIL");
      d.flags.push({ code: "GRACE", detail: `+${need} grace mark(s) under ${graceRule.key} v${graceRule.version} (limit ${grace.maxPerCourse}/course)` });
    } else {
      d.flags.push({ code: "GRACE_NOT_APPLICABLE", detail: `Shortfall ${d.aggregateShortfall} exceeds grace limits` });
    }
  }
}

function courseRow(d: Draft, grace: number, grading: GradingParams): CourseRow {
  const total = round(d.rawTotal + grace, 2);
  const pct = (total / d.max) * 100;
  const gr = d.status === "PASS" ? gradeFor(grading, pct) : { grade: d.status === "FAIL" ? grading.failGrade : d.status, point: 0 };
  return {
    enrolmentId: d.enrolmentId, studentId: d.studentId, courseId: d.courseId,
    components: d.components as unknown as Prisma.InputJsonValue, rawTotal: d.rawTotal, grace, total,
    grade: gr.grade, gradePoint: gr.point, credits: d.credits, status: d.status, flags: d.flags as unknown as Prisma.InputJsonValue,
  };
}

/** Rows must be ordered by semester, then newest publication first: a supplementary result supersedes the regular one. */
export function firstPerSemester<T extends { semester: number }>(rows: T[]) {
  const out: T[] = [];
  for (const r of rows) if (!out.some((x) => x.semester === r.semester)) out.push(r);
  return out;
}

export const PUBLISHED_ORDER = [{ semester: "asc" as const }, { run: { publishedAt: "desc" as const } }];

export async function publishedSemesters(studentId: string, beforeSemester?: number) {
  return firstPerSemester(
    await db.semesterResult.findMany({
      where: { studentId, run: { status: "PUBLISHED" }, ...(beforeSemester != null ? { semester: { lt: beforeSemester } } : {}) },
      orderBy: PUBLISHED_ORDER,
    }),
  );
}

export async function semesterRow(studentId: string, semester: number, rows: CourseRow[], grading: GradingParams) {
  const credits = rows.reduce((a, r) => a + r.credits, 0);
  const earned = rows.filter((r) => r.status === "PASS").reduce((a, r) => a + r.credits, 0);
  const sgpa = round(rows.reduce((a, r) => a + r.credits * r.gradePoint, 0) / credits, grading.rounding);
  const prior = await publishedSemesters(studentId, semester);
  const cgpa = round((prior.reduce((a, p) => a + p.sgpa * p.credits, 0) + sgpa * credits) / (prior.reduce((a, p) => a + p.credits, 0) + credits), grading.rounding);
  const withheld = rows.some((r) => r.status === "W");
  const failed = rows.filter((r) => ["FAIL", "AB", "NA"].includes(r.status)).length;
  const result = withheld ? "WITHHELD" : failed ? "FAIL" : "PASS";
  const flags: Flag[] = [];
  if (failed) flags.push({ code: "BACKLOG", detail: `${failed} course(s) to be cleared in repeat/re-registration` });
  if (withheld) flags.push({ code: "WITHHELD", detail: "Result withheld pending evaluation" });
  return {
    studentId, semester, credits, earnedCredits: earned, sgpa, cgpa, result,
    division: result === "PASS" ? divisionFor(grading, cgpa) : null, flags: flags as unknown as Prisma.InputJsonValue,
  };
}

async function computeStudents(ctx: Ctx, enrolments: EnrolmentRow[]) {
  const byStudent = new Map<string, Draft[]>();
  for (const e of enrolments) {
    const d = draftFor(e, ctx);
    byStudent.set(d.studentId, [...(byStudent.get(d.studentId) ?? []), d]);
  }
  const graceApplied = new Map<string, number>();
  const courseRows: CourseRow[] = [];
  const semRows: Awaited<ReturnType<typeof semesterRow>>[] = [];
  for (const [studentId, list] of byStudent) {
    applyGrace(list, ctx, graceApplied);
    const rows = list.map((d) => courseRow(d, graceApplied.get(d.enrolmentId) ?? 0, ctx.grading));
    courseRows.push(...rows);
    semRows.push(await semesterRow(studentId, list[0].semester, rows, ctx.grading));
  }
  return { courseRows, semRows, graceApplied };
}

export async function summariseRun(runId: string) {
  const [courseRows, semRows] = await Promise.all([db.courseResult.findMany({ where: { runId } }), db.semesterResult.findMany({ where: { runId } })]);
  const summary = {
    students: semRows.length, pass: semRows.filter((s) => s.result === "PASS").length, fail: semRows.filter((s) => s.result === "FAIL").length,
    withheld: semRows.filter((s) => s.result === "WITHHELD").length, graceCount: courseRows.filter((r) => r.grace > 0).length,
    componentFail: 0, notAllowed: 0, absent: 0, grades: {} as Record<string, number>,
  };
  for (const r of courseRows) {
    summary.grades[r.grade] = (summary.grades[r.grade] ?? 0) + 1;
    if (((r.flags as unknown as Flag[]) ?? []).some((x) => x.code === "COMPONENT_FAIL")) summary.componentFail++;
    if (r.status === "NA") summary.notAllowed++;
    if (r.status === "AB") summary.absent++;
  }
  await db.resultRun.update({ where: { id: runId }, data: { summary } });
  return summary;
}

/**
 * Computes course and semester results for every enrolment examined in this cycle.
 * All thresholds come from configured rules and evaluation schemes — nothing is hard-coded here.
 */
export async function processResults(examId: string, actor: { id: string; role: string }) {
  const ctx = await loadCtx(examId);
  if (!ctx) return { error: "No active grading rule is configured." };
  const enrolments = await db.enrolment.findMany({ where: { academicYear: ctx.exam.academicYear, status: "ACTIVE" }, include: enrolmentInclude(examId) });
  const { courseRows, semRows } = await computeStudents(ctx, enrolments);

  await db.resultRun.updateMany({ where: { examId, status: { in: ["PROCESSED", "APPROVED"] } }, data: { status: "WITHDRAWN" } });
  const run = await db.resultRun.create({
    data: {
      examId,
      label: `${ctx.exam.name} — result run ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      status: "PROCESSED",
      processedById: actor.id,
      rulesUsed: {
        grading: { key: ctx.gradingRule.key, version: ctx.gradingRule.version },
        grace: ctx.graceRule ? { key: ctx.graceRule.key, version: ctx.graceRule.version } : null,
        schemes: Array.from(new Set(enrolments.map((e) => e.course.scheme.code))),
      },
    },
  });
  await db.courseResult.createMany({ data: courseRows.map((r) => ({ ...r, runId: run.id })) });
  await db.semesterResult.createMany({ data: semRows.map((r) => ({ ...r, runId: run.id })) });
  const summary = await summariseRun(run.id);
  await db.exam.update({ where: { id: examId }, data: { status: "RESULT" } });

  await audit({
    actorId: actor.id, actorRole: actor.role, action: "RESULTS_PROCESSED", entity: "ResultRun", entityId: run.id,
    summary: `Results processed for ${summary.students} students (${courseRows.length} course results): ${summary.pass} pass, ${summary.fail} with backlog, ${summary.withheld} withheld; ${summary.graceCount} grace application(s); identities decoded from ${ctx.scripts.length} scripts`,
    after: { ...summary, rules: { grading: `${ctx.gradingRule.key} v${ctx.gradingRule.version}`, grace: ctx.graceRule ? `${ctx.graceRule.key} v${ctx.graceRule.version}` : null } },
  });
  return { runId: run.id, summary };
}

/**
 * Recomputes one student's results inside an existing run (e.g. after revaluation), using exactly
 * the rule versions recorded on that run. Returns before/after for the audit trail.
 */
export async function amendStudentResult(runId: string, studentId: string) {
  const run = await db.resultRun.findUniqueOrThrow({ where: { id: runId } });
  const ctx = await loadCtx(run.examId, run.rulesUsed as unknown as RulesUsed);
  if (!ctx) throw new Error("Rule versions recorded on this run are missing");
  const enrolments = await db.enrolment.findMany({ where: { studentId, academicYear: ctx.exam.academicYear, status: "ACTIVE" }, include: enrolmentInclude(run.examId) });
  const before = await db.courseResult.findMany({ where: { runId, studentId }, include: { enrolment: { include: { course: true } } } });
  const beforeSem = await db.semesterResult.findFirst({ where: { runId, studentId } });
  const { courseRows, semRows } = await computeStudents(ctx, enrolments);

  for (const r of courseRows) {
    await db.courseResult.upsert({ where: { runId_enrolmentId: { runId, enrolmentId: r.enrolmentId } }, create: { ...r, runId }, update: r });
  }
  const sem = semRows[0];
  const semResult = await db.semesterResult.upsert({
    where: { runId_studentId_semester: { runId, studentId, semester: sem.semester } },
    create: { ...sem, runId },
    update: sem,
  });
  await summariseRun(runId);
  const pick = (rows: { courseId: string; grade: string; total: number }[]) => Object.fromEntries(rows.map((r) => [before.find((b) => b.courseId === r.courseId)?.enrolment.course.code ?? r.courseId, `${r.total} ${r.grade}`]));
  return {
    semResultId: semResult.id,
    before: { courses: pick(before), sgpa: beforeSem?.sgpa, cgpa: beforeSem?.cgpa, result: beforeSem?.result },
    after: { courses: pick(courseRows.map((r) => ({ courseId: r.courseId, grade: r.grade, total: r.total }))), sgpa: semResult.sgpa, cgpa: semResult.cgpa, result: semResult.result },
  };
}
