import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { asParams, divisionFor, gradeFor, round, type GraceParams, type GradingParams } from "../rules/engine";
import { getActiveRule } from "../rules/store";

export type ComponentResult = { code: string; name: string; max: number; marks: number | null; pass: number | null; ok: boolean };
export type Flag = { code: string; detail: string };
export type CourseStatus = "PASS" | "FAIL" | "AB" | "NA" | "W";

type Draft = {
  enrolmentId: string; studentId: string; courseId: string; code: string; title: string; credits: number;
  components: ComponentResult[]; rawTotal: number; max: number; status: CourseStatus; flags: Flag[];
  aggregateShortfall: number; componentFail: boolean;
};

/**
 * Computes course and semester results for every enrolment examined in this cycle.
 * All thresholds come from configured rules and evaluation schemes — nothing is hard-coded here.
 */
export async function processResults(examId: string, actor: { id: string; role: string }) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: true } });
  const gradingRule = await getActiveRule("GRADING");
  const graceRule = await getActiveRule("GRACE");
  if (!gradingRule) return { error: "No active grading rule is configured." };
  const grading = asParams<GradingParams>(gradingRule);
  const grace = graceRule ? asParams<GraceParams>(graceRule) : null;

  const enrolments = await db.enrolment.findMany({
    where: { academicYear: exam.academicYear, status: "ACTIVE" },
    include: {
      course: { include: { scheme: { include: { components: { orderBy: { sortOrder: "asc" } } } } } },
      markEntries: true,
      eligibilities: { where: { examId } },
    },
  });
  const regs = await db.registrationPaper.findMany({ where: { registration: { examId } }, include: { registration: true } });
  const scripts = await db.answerScript.findMany({ where: { examPaper: { examId } } });

  const drafts: Draft[] = [];
  for (const e of enrolments) {
    const paper = exam.papers.find((p) => p.courseId === e.courseId);
    const flags: Flag[] = [];
    const scheme = e.course.scheme;
    const max = scheme.components.reduce((a, c) => a + c.maxMarks, 0);
    const components: ComponentResult[] = scheme.components.map((c) => {
      const m = e.markEntries.find((x) => x.componentId === c.id);
      const marks = m?.absent ? null : m?.marks ?? null;
      return { code: c.code, name: c.name, max: c.maxMarks, marks, pass: c.passMarks, ok: c.passMarks == null || (marks ?? 0) >= c.passMarks };
    });
    const rawTotal = round(components.reduce((a, c) => a + (c.marks ?? 0), 0), 2);
    let status: CourseStatus = "PASS";

    if (paper) {
      const elig = e.eligibilities[0];
      const registered = regs.some((r) => r.examPaperId === paper.id && r.registration.studentId === e.studentId);
      const script = scripts.find((s) => s.examPaperId === paper.id && s.studentId === e.studentId);
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
    }
    if (status === "PASS" && !paper && components.some((c) => c.marks == null)) {
      status = "W";
      flags.push({ code: "MARKS_MISSING", detail: "Internal assessment marks incomplete" });
    }

    let aggregateShortfall = 0;
    let componentFail = false;
    if (status === "PASS") {
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
    }
    drafts.push({
      enrolmentId: e.id, studentId: e.studentId, courseId: e.courseId, code: e.course.code, title: e.course.title, credits: e.course.credits,
      components, rawTotal, max, status, flags, aggregateShortfall, componentFail,
    });
  }

  // Grace marks: applied per student within configured limits, smallest shortfall first, only where it secures a pass.
  const byStudent = new Map<string, Draft[]>();
  for (const d of drafts) byStudent.set(d.studentId, [...(byStudent.get(d.studentId) ?? []), d]);
  const graceApplied = new Map<string, number>();
  if (grace?.enabled) {
    for (const list of byStudent.values()) {
      let used = 0;
      let courses = 0;
      for (const d of list.filter((x) => x.status === "FAIL" && !x.componentFail && x.aggregateShortfall > 0).sort((a, b) => a.aggregateShortfall - b.aggregateShortfall)) {
        const need = Math.ceil(d.aggregateShortfall);
        if (need <= grace.maxPerCourse && used + need <= grace.maxPerSemester && courses < grace.maxCourses) {
          used += need;
          courses++;
          graceApplied.set(d.enrolmentId, need);
          d.status = "PASS";
          d.flags = d.flags.filter((f) => f.code !== "AGGREGATE_FAIL");
          d.flags.push({ code: "GRACE", detail: `+${need} grace mark(s) under ${graceRule!.key} v${graceRule!.version} (limit ${grace.maxPerCourse}/course)` });
        } else {
          d.flags.push({ code: "GRACE_NOT_APPLICABLE", detail: `Shortfall ${d.aggregateShortfall} exceeds grace limits` });
        }
      }
    }
  }

  // Supersede earlier unpublished runs
  await db.resultRun.updateMany({ where: { examId, status: { in: ["PROCESSED", "APPROVED"] } }, data: { status: "WITHDRAWN" } });
  const run = await db.resultRun.create({
    data: {
      examId,
      label: `${exam.name} — result run ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      status: "PROCESSED",
      processedById: actor.id,
      rulesUsed: {
        grading: { key: gradingRule.key, version: gradingRule.version },
        grace: graceRule ? { key: graceRule.key, version: graceRule.version } : null,
        schemes: Array.from(new Set(enrolments.map((e) => `${e.course.scheme.code}`))),
      },
    },
  });

  const courseRows: Prisma.CourseResultCreateManyInput[] = drafts.map((d) => {
    const g = graceApplied.get(d.enrolmentId) ?? 0;
    const total = round(d.rawTotal + g, 2);
    const pct = (total / d.max) * 100;
    const gr = d.status === "PASS" ? gradeFor(grading, pct) : { grade: d.status === "FAIL" ? grading.failGrade : d.status, point: 0 };
    return {
      runId: run.id, enrolmentId: d.enrolmentId, studentId: d.studentId, courseId: d.courseId,
      components: d.components as unknown as Prisma.InputJsonValue, rawTotal: d.rawTotal, grace: g, total,
      grade: gr.grade, gradePoint: gr.point, credits: d.credits, status: d.status, flags: d.flags as unknown as Prisma.InputJsonValue,
    };
  });
  await db.courseResult.createMany({ data: courseRows });

  // Semester results: SGPA over the semester, CGPA over all published semesters (incl. migrated legacy records)
  const semRows: Prisma.SemesterResultCreateManyInput[] = [];
  const summary = { students: 0, pass: 0, fail: 0, withheld: 0, graceCount: graceApplied.size, componentFail: 0, notAllowed: 0, absent: 0, grades: {} as Record<string, number> };
  for (const studentId of byStudent.keys()) {
    const rows = courseRows.filter((r) => r.studentId === studentId);
    const semester = enrolments.find((e) => e.studentId === studentId)!.semester;
    const credits = rows.reduce((a, r) => a + r.credits, 0);
    const earned = rows.filter((r) => r.status === "PASS").reduce((a, r) => a + r.credits, 0);
    const sgpa = round(rows.reduce((a, r) => a + r.credits * r.gradePoint, 0) / credits, grading.rounding);
    const prior = await db.semesterResult.findMany({ where: { studentId, semester: { lt: semester }, run: { status: "PUBLISHED" } } });
    const cgpa = round((prior.reduce((a, p) => a + p.sgpa * p.credits, 0) + sgpa * credits) / (prior.reduce((a, p) => a + p.credits, 0) + credits), grading.rounding);
    const withheld = rows.some((r) => r.status === "W");
    const failed = rows.filter((r) => ["FAIL", "AB", "NA"].includes(r.status)).length;
    const result = withheld ? "WITHHELD" : failed ? "FAIL" : "PASS";
    const flags: Flag[] = [];
    if (failed) flags.push({ code: "BACKLOG", detail: `${failed} course(s) to be cleared in repeat/re-registration` });
    if (withheld) flags.push({ code: "WITHHELD", detail: "Result withheld pending evaluation" });
    semRows.push({
      runId: run.id, studentId, semester, credits, earnedCredits: earned, sgpa, cgpa, result,
      division: result === "PASS" ? divisionFor(grading, cgpa) : null, flags: flags as unknown as Prisma.InputJsonValue,
    });
    summary.students++;
    if (result === "PASS") summary.pass++;
    else if (result === "FAIL") summary.fail++;
    else summary.withheld++;
  }
  for (const r of courseRows) {
    summary.grades[r.grade] = (summary.grades[r.grade] ?? 0) + 1;
    const f = (r.flags as unknown as Flag[]) ?? [];
    if (f.some((x) => x.code === "COMPONENT_FAIL")) summary.componentFail++;
    if (r.status === "NA") summary.notAllowed++;
    if (r.status === "AB") summary.absent++;
  }
  await db.semesterResult.createMany({ data: semRows });
  await db.resultRun.update({ where: { id: run.id }, data: { summary } });
  await db.exam.update({ where: { id: examId }, data: { status: "RESULT" } });

  await audit({
    actorId: actor.id, actorRole: actor.role, action: "RESULTS_PROCESSED", entity: "ResultRun", entityId: run.id,
    summary: `Results processed for ${summary.students} students (${courseRows.length} course results): ${summary.pass} pass, ${summary.fail} with backlog, ${summary.withheld} withheld; ${summary.graceCount} grace application(s); identities decoded from ${scripts.length} scripts`,
    after: { ...summary, rules: { grading: `${gradingRule.key} v${gradingRule.version}`, grace: graceRule ? `${graceRule.key} v${graceRule.version}` : null } },
  });
  return { runId: run.id, summary };
}
