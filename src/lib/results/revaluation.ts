import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { getActiveRule } from "../rules/store";
import { asParams } from "../rules/engine";
import { amendStudentResult } from "./engine";
import { reissueGradeSheet } from "./workflow";
import { REVALUATION_ROUND } from "../exams/evaluation";

export type RevaluationParams = {
  windowDays: number;
  feeRevaluation: number;
  feeScrutiny: number;
  minChangePct: number;
  allowDecrease: boolean;
  maxPapers: number;
};
export type ScrutinyCheck = { label: string; ok: boolean; detail: string };
export type ScrutinyFindings = { checks: ScrutinyCheck[]; computedTotal: number; discrepancy: boolean };

type Actor = { id: string; role: string };

async function activeRule() {
  const rule = await getActiveRule("REVALUATION");
  return rule ? { rule, p: asParams<RevaluationParams>(rule) } : null;
}

async function publishedRun(examId?: string) {
  return db.resultRun.findFirst({
    where: { status: "PUBLISHED", exam: examId ? { id: examId } : { code: { not: "LEGACY-MIGRATION" }, type: "REGULAR" } },
    orderBy: { publishedAt: "desc" },
    include: { exam: true },
  });
}

/** Papers a student may challenge, with window and fee information. */
export async function revaluationOptions(studentId: string) {
  const [run, cfg] = await Promise.all([publishedRun(), activeRule()]);
  if (!run || !cfg) return null;
  const deadline = new Date(run.publishedAt!.getTime() + cfg.p.windowDays * 86400000);
  const scripts = await db.answerScript.findMany({
    where: { studentId, status: "FINALISED", examPaper: { examId: run.examId } },
    include: { examPaper: { include: { course: true } } },
    orderBy: { examPaper: { course: { code: "asc" } } },
  });
  const requests = await db.revaluationRequest.findMany({ where: { studentId, examId: run.examId }, orderBy: { createdAt: "desc" } });
  const results = await db.courseResult.findMany({ where: { runId: run.id, studentId } });
  return {
    run, deadline, open: Date.now() <= deadline.getTime(), params: cfg.p, ruleVersion: cfg.rule.version,
    papers: scripts.map((s) => ({
      scriptId: s.id, courseId: s.examPaper.courseId, code: s.examPaper.course.code, title: s.examPaper.course.title,
      marks: s.finalMarks ?? 0, max: s.examPaper.maxMarks, grade: results.find((r) => r.courseId === s.examPaper.courseId)?.grade ?? "—",
      requests: requests.filter((r) => r.scriptId === s.id),
    })),
    used: new Set(requests.map((r) => r.scriptId)).size,
  };
}

export async function applyRevaluation(studentId: string, scriptId: string, type: "REVALUATION" | "SCRUTINY", reason: string, method: string, actor: Actor) {
  const opts = await revaluationOptions(studentId);
  if (!opts) return { error: "Revaluation is not available — results have not been published." };
  if (!opts.open) return { error: `The revaluation window closed on ${opts.deadline.toLocaleDateString("en-IN")}.` };
  const paper = opts.papers.find((p) => p.scriptId === scriptId);
  if (!paper) return { error: "Only end-semester papers evaluated on screen can be challenged." };
  if (paper.requests.some((r) => r.type === type)) return { error: `A ${type.toLowerCase()} request already exists for ${paper.code}.` };
  if (!paper.requests.length && opts.used >= opts.params.maxPapers) return { error: `At most ${opts.params.maxPapers} papers may be challenged per semester.` };
  const enrol = await db.enrolment.findFirstOrThrow({ where: { studentId, courseId: paper.courseId, academicYear: opts.run.exam.academicYear } });
  const fee = type === "REVALUATION" ? opts.params.feeRevaluation : opts.params.feeScrutiny;

  let req = await db.revaluationRequest.create({
    data: {
      examId: opts.run.examId, studentId, enrolmentId: enrol.id, scriptId, courseCode: paper.code, type, reason: reason || null,
      fee, paymentRef: `${method}-${randomBytes(4).toString("hex").toUpperCase()}`, originalMarks: paper.marks, maxMarks: paper.max, ruleVersion: opts.ruleVersion,
    },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "REVALUATION_APPLIED", entity: "RevaluationRequest", entityId: req.id,
    summary: `${type === "REVALUATION" ? "Revaluation" : "Scrutiny (re-totalling)"} applied for ${paper.code} (current ${paper.marks}/${paper.max}); fee ₹${fee} paid (${req.paymentRef})`,
    after: { type, course: paper.code, originalMarks: paper.marks },
  });
  if (type === "SCRUTINY") {
    const findings = await scrutinise(scriptId);
    req = await db.revaluationRequest.update({
      where: { id: req.id },
      data: { status: "EVALUATED", findings: findings as unknown as Prisma.InputJsonValue, revisedMarks: findings.discrepancy ? findings.computedTotal : paper.marks },
    });
  }
  return { ok: true, id: req.id };
}

/** Re-totalling: verifies every question was evaluated, totals add up, and the posted mark matches the finalised script. */
export async function scrutinise(scriptId: string): Promise<ScrutinyFindings> {
  const script = await db.answerScript.findUniqueOrThrow({ where: { id: scriptId }, include: { examPaper: true, evaluations: { where: { status: "LOCKED", round: { lt: REVALUATION_ROUND } } } } });
  const scheme = (script.examPaper.questionScheme as { q: string; max: number }[]) ?? [];
  const checks: ScrutinyCheck[] = [];
  const totals: number[] = [];
  for (const ev of script.evaluations.sort((a, b) => a.round - b.round)) {
    const q = ((ev.marks as { questions?: Record<string, number> } | null)?.questions ?? {}) as Record<string, number>;
    const missing = scheme.filter((s) => q[s.q] == null).map((s) => s.q);
    checks.push({ label: `Round ${ev.round}: all questions evaluated`, ok: missing.length === 0, detail: missing.length ? `Not evaluated: ${missing.join(", ")}` : `${scheme.length} of ${scheme.length} questions marked` });
    const sum = scheme.reduce((a, s) => a + (q[s.q] ?? 0), 0);
    checks.push({ label: `Round ${ev.round}: question-wise marks add up`, ok: sum === ev.total, detail: `Σ questions = ${sum}; recorded total = ${ev.total}` });
    const over = scheme.filter((s) => (q[s.q] ?? 0) > s.max).map((s) => s.q);
    checks.push({ label: `Round ${ev.round}: no question exceeds its maximum`, ok: over.length === 0, detail: over.length ? `Exceeds maximum: ${over.join(", ")}` : "Within limits" });
    totals.push(sum);
  }
  const adopted = await db.revaluationRequest.findFirst({ where: { scriptId, type: "REVALUATION", outcome: "REVISED" }, orderBy: { decidedAt: "desc" } });
  const computed = adopted?.revisedMarks ?? (totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 2) / 2 : script.finalMarks ?? 0);
  checks.push({
    label: adopted ? "Final mark = adopted revaluation marks" : "Final mark = mean of evaluation rounds",
    ok: computed === script.finalMarks,
    detail: `${adopted ? "Revalued" : "Computed"} ${computed}; finalised ${script.finalMarks}`,
  });
  const enrol = await db.enrolment.findFirst({ where: { studentId: script.studentId, courseId: script.examPaper.courseId }, include: { markEntries: { include: { component: true } } } });
  const posted = enrol?.markEntries.find((m) => m.component.source === "EXAM")?.marks;
  checks.push({ label: "Mark posted to result processing", ok: posted === script.finalMarks, detail: `Posted ${posted ?? "—"}; finalised ${script.finalMarks}` });
  return { checks, computedTotal: computed, discrepancy: checks.some((c) => !c.ok) };
}

/** Candidate re-evaluators: never the paper setter or anyone who already evaluated the script. */
export async function eligibleRevaluators(scriptId: string) {
  const script = await db.answerScript.findUniqueOrThrow({ where: { id: scriptId }, include: { examPaper: true, evaluations: true } });
  const excluded = new Set([script.examPaper.setterId, ...script.evaluations.map((e) => e.evaluatorId)].filter(Boolean) as string[]);
  const people = (await db.user.findMany({ where: { role: { in: ["EVALUATOR", "FACULTY"] } }, orderBy: { name: "asc" } })).sort(
    (a, b) => Number(a.role !== "EVALUATOR") - Number(b.role !== "EVALUATOR"),
  );
  return people.map((p) => ({ id: p.id, name: p.name, role: p.role, eligible: !excluded.has(p.id), reason: p.id === script.examPaper.setterId ? "paper setter" : excluded.has(p.id) ? "evaluated this script" : null }));
}

export async function assignRevaluator(requestId: string, evaluatorId: string, actor: Actor) {
  const req = await db.revaluationRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.type !== "REVALUATION" || req.status !== "PAID") return { error: "This request is not awaiting an evaluator." };
  const candidate = (await eligibleRevaluators(req.scriptId)).find((c) => c.id === evaluatorId);
  if (!candidate?.eligible) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "SEGREGATION_VIOLATION_BLOCKED", entity: "RevaluationRequest", entityId: requestId, summary: `Blocked: ${candidate?.name ?? "user"} cannot re-evaluate (${candidate?.reason ?? "not eligible"})` });
    return { error: `${candidate?.name ?? "This user"} cannot re-evaluate this script (${candidate?.reason ?? "not eligible"}).` };
  }
  const ev = await db.evaluation.upsert({
    where: { scriptId_round: { scriptId: req.scriptId, round: REVALUATION_ROUND } },
    create: { scriptId: req.scriptId, evaluatorId, round: REVALUATION_ROUND, status: "ASSIGNED" },
    update: { evaluatorId, status: "ASSIGNED", marks: Prisma.DbNull, total: null, submittedAt: null, signatureHash: null },
  });
  await db.revaluationRequest.update({ where: { id: requestId }, data: { status: "ASSIGNED", evaluationId: ev.id } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "REVALUATOR_ASSIGNED", entity: "RevaluationRequest", entityId: requestId, summary: `${req.courseCode} script sent for blind re-evaluation to ${candidate.name}` });
  return { ok: true };
}

/** Decision by the Controller of Examinations under the active revaluation rule; amends the published result when marks change. */
export async function decideRevaluation(requestId: string, actor: Actor) {
  const req = await db.revaluationRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== "EVALUATED" || req.revisedMarks == null) return { error: "The request is not ready for a decision." };
  const cfg = await activeRule();
  if (!cfg) return { error: "No revaluation rule is configured." };
  const { p } = cfg;
  const change = req.revisedMarks - req.originalMarks;
  const threshold = (req.maxMarks * p.minChangePct) / 100;
  const adopt =
    req.type === "SCRUTINY"
      ? change !== 0
      : Math.abs(change) >= threshold && (p.allowDecrease || change > 0);
  const note = adopt
    ? `Revised marks ${req.revisedMarks}/${req.maxMarks} adopted (change ${change > 0 ? "+" : ""}${change}${req.type === "REVALUATION" ? `, threshold ${threshold}` : ""})`
    : req.type === "SCRUTINY"
      ? "Scrutiny found no discrepancy — marks unchanged"
      : `Change ${change > 0 ? "+" : ""}${change} is below the ${p.minChangePct}% threshold (${threshold}) — original marks stand`;

  let amendment: Awaited<ReturnType<typeof amendStudentResult>> | null = null;
  let newSheet: string | null = null;
  if (adopt) {
    const script = await db.answerScript.findUniqueOrThrow({ where: { id: req.scriptId }, include: { examPaper: true } });
    const comp = await db.assessmentComponent.findFirstOrThrow({ where: { scheme: { courses: { some: { id: script.examPaper.courseId } } }, source: "EXAM" } });
    await db.markEntry.update({ where: { enrolmentId_componentId: { enrolmentId: req.enrolmentId, componentId: comp.id } }, data: { marks: req.revisedMarks } });
    await db.answerScript.update({ where: { id: req.scriptId }, data: { finalMarks: req.revisedMarks } });
    const run = await publishedRun(req.examId);
    if (run) {
      amendment = await amendStudentResult(run.id, req.studentId);
      const doc = await reissueGradeSheet(amendment.semResultId, `after ${req.type === "REVALUATION" ? "revaluation" : "scrutiny"} of ${req.courseCode}`, actor);
      newSheet = doc.verifyCode;
    }
  }
  await db.revaluationRequest.update({
    where: { id: requestId },
    data: { status: "DECIDED", outcome: adopt ? "REVISED" : "UNCHANGED", outcomeNote: note, decidedById: actor.id, decidedAt: new Date() },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: adopt ? "RESULT_AMENDED" : "REVALUATION_DECIDED", entity: "RevaluationRequest", entityId: requestId,
    summary: `${req.courseCode}: ${note}${newSheet ? `; revised grade sheet ${newSheet} issued` : ""}`,
    before: amendment?.before ?? { marks: req.originalMarks },
    after: amendment?.after ?? { marks: req.originalMarks },
  });
  return { ok: true, adopted: adopt, note, newSheet };
}
