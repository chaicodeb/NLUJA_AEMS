import { createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { hashPayload } from "../docs";
import { BALLB_2022, BALLB_2025, LLM_2026, genMark, rng, type StudentSeed } from "../demo/scenarios";
import { DEMO_TOUGH_PAPER } from "../demo/constants";

export type QuestionScheme = { q: string; max: number }[];
export type Annotation = { page: number; x: number; y: number; kind: "tick" | "cross" | "comment"; text?: string };
export type EvaluationMarks = { questions: Record<string, number>; annotations: Annotation[] };

/** Evaluation round reserved for post-result revaluation (rounds 1–3 are regular evaluations). */
export const REVALUATION_ROUND = 9;

/** Disagreement between two evaluators beyond this share of the paper's maximum triggers a third evaluation. */
export const THIRD_EVAL_THRESHOLD = 0.15;

const ACTOR_KEY = process.env.DOC_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? "dev";

export function signEvaluation(evaluatorId: string, scriptId: string, marks: EvaluationMarks, total: number, at: Date) {
  const hash = hashPayload({ evaluatorId, scriptId, questions: marks.questions, total, at: at.toISOString() });
  return createHmac("sha256", ACTOR_KEY).update(hash).digest("hex");
}

function seedFor(name: string): StudentSeed | undefined {
  return [...BALLB_2022, ...BALLB_2025, ...LLM_2026].find((s) => s.name === name);
}

function splitTotal(total: number, scheme: QuestionScheme, r: () => number): Record<string, number> {
  const out: Record<string, number> = {};
  let remaining = total;
  scheme.forEach((q, i) => {
    const left = scheme.length - i - 1;
    const maxRest = scheme.slice(i + 1).reduce((a, x) => a + x.max, 0);
    const lo = Math.max(0, remaining - maxRest);
    const hi = Math.min(q.max, remaining);
    const ideal = left ? remaining / (left + 1) : remaining;
    const v = left ? Math.max(lo, Math.min(hi, Math.round(ideal + (r() - 0.5) * 4))) : remaining;
    out[q.q] = v;
    remaining -= v;
  });
  return out;
}

const LIVE_PENDING = { round1: { course: "BL9.2", students: ["Tenzing Bhutia", "Moumita Gogoi"] }, round2: { course: "BL9.1", students: ["Sanjana Sangma"] } };

/**
 * Demo: conducts the examination — marks attendance, collects and barcodes answer scripts,
 * records the chain of custody, scans them and allocates evaluators. Most evaluations are
 * completed automatically; a few are left pending for the live evaluator walkthrough.
 */
export async function conductExam(examId: string, actor: { id: string; role: string }) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { papers: { include: { course: true } } } });
  if (!exam.admitCardsPublished) return { error: "Publish admit cards before conducting the examination." };
  if (await db.answerScript.count({ where: { examPaper: { examId } } })) return { error: "Scripts already exist for this examination." };

  const r = rng(4242);
  const seats = await db.seatAllocation.findMany({
    where: { examPaper: { examId } },
    include: { student: true, room: true, examPaper: { include: { course: true } } },
    orderBy: [{ examPaper: { course: { code: "asc" } } }, { student: { rollNo: "asc" } }],
  });
  const evaluators = await db.user.findMany({ where: { role: "EVALUATOR" }, orderBy: { email: "asc" } });
  const [evalA, evalB] = [evaluators.find((e) => e.email.includes("hazarika"))!, evaluators.find((e) => e.email.includes("lalremruati"))!];
  const examStaff = await db.user.findFirst({ where: { role: "EXAM_STAFF" } });
  const invigs = await db.invigilation.findMany({ where: { examId }, include: { user: true } });

  const custody: Prisma.CustodyEventCreateManyInput[] = [];
  const evaluations: Prisma.EvaluationCreateManyInput[] = [];
  let absent = 0;
  let scripts = 0;

  for (const s of seats) {
    const seed = seedFor(s.student.name);
    const code = s.examPaper.course.code;
    const isAbsent = seed?.end?.[code] === "AB";
    await db.seatAllocation.update({ where: { id: s.id }, data: { attended: !isAbsent } });
    if (isAbsent) {
      absent++;
      const enrol = await db.enrolment.findFirst({ where: { studentId: s.studentId, courseId: s.examPaper.courseId } });
      const comp = await db.assessmentComponent.findFirst({ where: { scheme: { courses: { some: { id: s.examPaper.courseId } } }, source: "EXAM" } });
      if (enrol && comp) await db.markEntry.create({ data: { enrolmentId: enrol.id, componentId: comp.id, absent: true, status: "LOCKED", source: "EXAM" } });
      continue;
    }
    scripts++;
    const dummyNo = `${code.replace(".", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const script = await db.answerScript.create({
      data: {
        examPaperId: s.examPaperId, studentId: s.studentId, dummyNo, barcode: `NLUJA26${String(100000 + scripts * 37).slice(-6)}${Math.floor(r() * 90 + 10)}`,
        pageCount: 6, status: "ALLOCATED", scanUrl: "rendered",
      },
    });
    const t0 = s.examPaper.date.getTime() + s.examPaper.durationMins * 60000;
    const invig = invigs.find((i) => i.roomId === s.roomId && i.session === s.examPaper.session)?.user.name ?? "Invigilator";
    custody.push(
      { scriptId: script.id, action: "COLLECTED", location: s.room.name, handler: invig, at: new Date(t0 + 5 * 60000) },
      { scriptId: script.id, action: "SEALED", location: `${s.room.name} — packet ${s.examPaper.course.code}/${s.room.code}`, handler: invig, at: new Date(t0 + 20 * 60000) },
      { scriptId: script.id, action: "STRONG_ROOM_IN", location: "Strong Room, Examination Branch", handler: examStaff?.name ?? "Examination Branch", at: new Date(t0 + 45 * 60000) },
      { scriptId: script.id, action: "BARCODED_MASKED", location: "Confidential Section", handler: examStaff?.name ?? "Examination Branch", at: new Date(t0 + 26 * 3600000) },
      { scriptId: script.id, action: "SCANNED", location: "Scanning Centre (300 DPI, PDF/A)", handler: examStaff?.name ?? "Examination Branch", at: new Date(t0 + 27 * 3600000) },
    );

    const scheme = (s.examPaper.questionScheme as QuestionScheme) ?? [];
    const max = s.examPaper.maxMarks;
    const ability = (seed?.ability ?? 0.65) * (code === DEMO_TOUGH_PAPER.course ? DEMO_TOUGH_PAPER.factor : 1);
    const target = typeof seed?.end?.[code] === "number" ? (seed.end[code] as number) : genMark(max, ability, r, 0.1);
    const round1Evaluator = code.startsWith("ML") ? evalB : evalA;
    const pending1 = code === LIVE_PENDING.round1.course && LIVE_PENDING.round1.students.includes(s.student.name);
    const q1 = splitTotal(target, scheme, r);
    const at1 = new Date(t0 + 3 * 86400000 + scripts * 60000);
    evaluations.push(
      pending1
        ? { scriptId: script.id, evaluatorId: round1Evaluator.id, round: 1, status: "ASSIGNED" }
        : {
            scriptId: script.id, evaluatorId: round1Evaluator.id, round: 1, status: "LOCKED", total: target, submittedAt: at1,
            marks: { questions: q1, annotations: [] }, signatureHash: signEvaluation(round1Evaluator.id, script.id, { questions: q1, annotations: [] }, target, at1),
          },
    );
    if (s.examPaper.evaluationMode === "DOUBLE") {
      const pending2 = code === LIVE_PENDING.round2.course && LIVE_PENDING.round2.students.includes(s.student.name);
      const t2 = Math.max(0, Math.min(max, target + Math.round((r() - 0.5) * 6)));
      const q2 = splitTotal(t2, scheme, r);
      const at2 = new Date(t0 + 4 * 86400000 + scripts * 60000);
      evaluations.push(
        pending2
          ? { scriptId: script.id, evaluatorId: evalB.id, round: 2, status: "ASSIGNED" }
          : {
              scriptId: script.id, evaluatorId: evalB.id, round: 2, status: "LOCKED", total: t2, submittedAt: at2,
              marks: { questions: q2, annotations: [] }, signatureHash: signEvaluation(evalB.id, script.id, { questions: q2, annotations: [] }, t2, at2),
            },
      );
    }
  }

  await db.custodyEvent.createMany({ data: custody });
  await db.evaluation.createMany({ data: evaluations });
  const all = await db.answerScript.findMany({ where: { examPaper: { examId } }, select: { id: true } });
  let finalised = 0;
  for (const s of all) if ((await tryFinalise(s.id)) === "FINALISED") finalised++;

  await db.exam.update({ where: { id: examId }, data: { status: "EVALUATION" } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "EXAM_CONDUCTED", entity: "Exam", entityId: examId,
    summary: `Examination conducted: ${scripts} scripts collected, barcoded, masked and scanned; ${absent} absent; custody recorded at 5 checkpoints per script`,
    after: { scripts, absent },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "EVALUATIONS_SIMULATED", entity: "Exam", entityId: examId,
    summary: `${evaluations.filter((e) => e.status === "LOCKED").length} evaluations completed by evaluators (simulated); ${evaluations.filter((e) => e.status === "ASSIGNED").length} pending; ${finalised} scripts finalised`,
  });
  return { scripts, absent, pending: evaluations.filter((e) => e.status === "ASSIGNED").length, finalised };
}

/** Moves a script to FINALISED once every required evaluation is locked, and posts the mark to the result module. */
export async function tryFinalise(scriptId: string) {
  const script = await db.answerScript.findUniqueOrThrow({ where: { id: scriptId }, include: { examPaper: true, evaluations: true } });
  const required = script.examPaper.evaluationMode === "DOUBLE" ? [1, 2] : script.examPaper.evaluationMode === "TRIPLE" ? [1, 2, 3] : [1];
  const locked = script.evaluations.filter((e) => e.status === "LOCKED");
  if (!required.every((r) => locked.some((e) => e.round === r))) {
    if (script.status !== "ALLOCATED") await db.answerScript.update({ where: { id: scriptId }, data: { status: "ALLOCATED", finalMarks: null } });
    return "PENDING";
  }

  const r1 = locked.find((e) => e.round === 1)!.total ?? 0;
  const r2 = locked.find((e) => e.round === 2)?.total;
  const r3 = locked.find((e) => e.round === 3)?.total;
  let final: number;
  if (r2 == null) final = r1;
  else if (Math.abs(r1 - r2) > script.examPaper.maxMarks * THIRD_EVAL_THRESHOLD) {
    if (r3 == null) {
      if (!script.evaluations.some((e) => e.round === 3)) {
        const third = await db.user.findFirst({ where: { role: "EVALUATOR", id: { notIn: script.evaluations.map((e) => e.evaluatorId) } } });
        if (third) await db.evaluation.create({ data: { scriptId, evaluatorId: third.id, round: 3, status: "ASSIGNED" } });
      }
      await db.answerScript.update({ where: { id: scriptId }, data: { status: "THIRD_EVALUATION" } });
      return "THIRD_EVALUATION";
    }
    final = [r1, r2, r3].sort((a, b) => Math.abs(a - r3) - Math.abs(b - r3)).slice(0, 2).reduce((a, b) => a + b, 0) / 2;
  } else final = (r1 + r2) / 2;
  final = Math.round(final * 2) / 2;

  await db.answerScript.update({ where: { id: scriptId }, data: { status: "FINALISED", finalMarks: final } });
  const enrol = await db.enrolment.findFirst({ where: { studentId: script.studentId, courseId: script.examPaper.courseId } });
  const comp = await db.assessmentComponent.findFirst({ where: { scheme: { courses: { some: { id: script.examPaper.courseId } } }, source: "EXAM" } });
  if (enrol && comp) {
    await db.markEntry.upsert({
      where: { enrolmentId_componentId: { enrolmentId: enrol.id, componentId: comp.id } },
      create: { enrolmentId: enrol.id, componentId: comp.id, marks: final, status: "LOCKED", source: "EXAM" },
      update: { marks: final, status: "LOCKED", absent: false },
    });
  }
  return "FINALISED";
}

export async function submitEvaluation(evaluationId: string, input: EvaluationMarks, remarks: string, actor: { id: string; role: string }, finalSubmit: boolean) {
  const ev = await db.evaluation.findUniqueOrThrow({ where: { id: evaluationId }, include: { script: { include: { examPaper: true } } } });
  if (ev.evaluatorId !== actor.id) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "ACCESS_DENIED", entity: "Evaluation", entityId: evaluationId, summary: "Attempted to mark a script not allocated to this evaluator" });
    return { error: "This script is not allocated to you." };
  }
  if (ev.status === "LOCKED") {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "LOCKED_EDIT_REJECTED", entity: "Evaluation", entityId: evaluationId, summary: `Attempt to alter locked evaluation of ${ev.script.dummyNo} rejected` });
    return { error: "This evaluation is locked. Only the Controller of Examinations can authorise a re-opening." };
  }
  const scheme = (ev.script.examPaper.questionScheme as QuestionScheme) ?? [];
  for (const q of scheme) {
    const v = input.questions[q.q];
    if (v == null || Number.isNaN(v)) {
      if (finalSubmit) return { error: `Enter marks for ${q.q} (enter 0 if not attempted).` };
      continue;
    }
    if (v < 0 || v > q.max) return { error: `${q.q}: marks must be between 0 and ${q.max}.` };
    if (Math.round(v * 2) !== v * 2) return { error: `${q.q}: marks must be in steps of 0.5.` };
  }
  const total = scheme.reduce((a, q) => a + (input.questions[q.q] ?? 0), 0);
  const at = new Date();
  const updated = await db.evaluation.update({
    where: { id: evaluationId },
    data: {
      marks: input as unknown as Prisma.InputJsonValue,
      total,
      remarks: remarks || null,
      status: finalSubmit ? "LOCKED" : "IN_PROGRESS",
      submittedAt: finalSubmit ? at : null,
      signatureHash: finalSubmit ? signEvaluation(actor.id, ev.scriptId, input, total, at) : null,
    },
  });
  if (finalSubmit) {
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "EVALUATION_LOCKED", entity: "Evaluation", entityId: evaluationId,
      summary: `Script ${ev.script.dummyNo} (round ${ev.round}) evaluated: ${total}/${ev.script.examPaper.maxMarks}; digitally signed and locked`,
      after: { questions: input.questions, total, signature: updated.signatureHash?.slice(0, 16) },
    });
    if (ev.round === REVALUATION_ROUND) {
      await db.revaluationRequest.updateMany({ where: { evaluationId }, data: { status: "EVALUATED", revisedMarks: total } });
      return { ok: true, total, state: "REVALUATED" };
    }
    const state = await tryFinalise(ev.scriptId);
    return { ok: true, total, state };
  }
  return { ok: true, total, state: "DRAFT" };
}

export async function reopenEvaluation(evaluationId: string, reason: string, actor: { id: string; role: string }) {
  const ev = await db.evaluation.findUniqueOrThrow({ where: { id: evaluationId }, include: { script: true } });
  if (ev.status !== "LOCKED") return { error: "Evaluation is not locked." };
  await db.evaluation.update({ where: { id: evaluationId }, data: { status: "IN_PROGRESS", signatureHash: null } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "EVALUATION_REOPENED", entity: "Evaluation", entityId: evaluationId,
    summary: `Administrative override: evaluation of ${ev.script.dummyNo} (round ${ev.round}) re-opened — ${reason}`,
    before: { status: "LOCKED", total: ev.total }, after: { status: "IN_PROGRESS" },
  });
  if (ev.round === REVALUATION_ROUND) await db.revaluationRequest.updateMany({ where: { evaluationId, status: "EVALUATED" }, data: { status: "ASSIGNED", revisedMarks: null } });
  else await tryFinalise(ev.scriptId);
  return { ok: true };
}

/** Reassign pending evaluations of a paper; a paper's setter can never evaluate it. */
export async function reassignEvaluator(examPaperId: string, round: number, evaluatorId: string, actor: { id: string; role: string }) {
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: examPaperId }, include: { course: true, setter: true } });
  const evaluator = await db.user.findUniqueOrThrow({ where: { id: evaluatorId } });
  if (paper.setterId === evaluatorId) {
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "SEGREGATION_VIOLATION_BLOCKED", entity: "ExamPaper", entityId: examPaperId,
      summary: `Blocked: ${evaluator.name} set ${paper.course.code} and cannot be assigned as its evaluator`,
    });
    return { error: `Segregation of duties: ${evaluator.name} set the question paper for ${paper.course.code} and cannot evaluate it.` };
  }
  const otherRound = await db.evaluation.findFirst({ where: { script: { examPaperId }, round: { not: round }, evaluatorId } });
  if (otherRound) return { error: `${evaluator.name} is already an evaluator in another round of this paper; independent evaluators are required.` };
  const res = await db.evaluation.updateMany({
    where: { script: { examPaperId }, round, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    data: { evaluatorId },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "EVALUATOR_REASSIGNED", entity: "ExamPaper", entityId: examPaperId,
    summary: `${res.count} pending round-${round} script(s) of ${paper.course.code} reassigned to ${evaluator.name}`,
  });
  return { ok: true, count: res.count };
}
