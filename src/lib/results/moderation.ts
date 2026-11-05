import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { asParams, round } from "../rules/engine";
import { getActiveRule } from "../rules/store";
import { INTERNAL_SOURCES } from "../marks/internal";
import { assessPass, type ComponentResult } from "./engine";

export type ModerationParams = { flagPassPctBelow: number; flagMeanPctBelow: number; maxAddPct: number; approvalAuthority: string };
export type PaperStat = { n: number; mean: number; meanPct: number; sd: number; passCount: number; passPct: number };
type Actor = { id: string; role: string };

export async function moderationRule() {
  const rule = await getActiveRule("MODERATION");
  return rule ? { rule, p: asParams<ModerationParams>(rule) } : null;
}

/** Moderation is a pre-result step: once a result run exists it can no longer change marks. */
export async function resultsStarted(examId: string) {
  return db.resultRun.findFirst({ where: { examId, status: { in: ["PROCESSED", "APPROVED", "PUBLISHED"] } } });
}

async function candidates(paperId: string) {
  const paper = await db.examPaper.findUniqueOrThrow({
    where: { id: paperId },
    include: { exam: true, course: { include: { scheme: { include: { components: { orderBy: { sortOrder: "asc" } } } } } } },
  });
  const enrolments = await db.enrolment.findMany({
    where: { courseId: paper.courseId, academicYear: paper.exam.academicYear, status: "ACTIVE" },
    include: { markEntries: true, student: true },
  });
  const end = paper.course.scheme.components.find((c) => c.source === "EXAM");
  const rows = enrolments
    .map((e) => ({ e, endEntry: e.markEntries.find((m) => m.componentId === end?.id) }))
    .filter((x) => x.endEntry && x.endEntry.marks != null && !x.endEntry.absent);
  return { paper, end, rows };
}

/** Course pass rate and end-semester mean for one paper, optionally with an additional uniform addition. */
export async function statsFor(paperId: string, extra = 0) {
  const { paper, end, rows } = await candidates(paperId);
  const scheme = paper.course.scheme;
  const max = scheme.components.reduce((a, c) => a + c.maxMarks, 0);
  const endMax = end?.maxMarks ?? paper.maxMarks;
  const ends: number[] = [];
  const newlyPassing: string[] = [];
  let passCount = 0;
  for (const { e } of rows) {
    const verdict = (add: number) => {
      const components: ComponentResult[] = scheme.components.map((c) => {
        const m = e.markEntries.find((x) => x.componentId === c.id);
        let marks = m?.absent || (INTERNAL_SOURCES.includes(c.source) && m?.status === "DRAFT") ? null : (m?.marks ?? null);
        if (c.id === end?.id && marks != null) marks = Math.min(c.maxMarks, marks + (m?.moderation ?? 0) + add);
        return { code: c.code, name: c.name, max: c.maxMarks, marks, pass: c.passMarks, ok: c.passMarks == null || (marks ?? 0) >= c.passMarks };
      });
      const total = round(components.reduce((a, c) => a + (c.marks ?? 0), 0), 2);
      return { pass: assessPass(components, scheme, total, max).status === "PASS", end: components.find((c) => c.code === end?.code)?.marks ?? 0 };
    };
    const now = verdict(extra);
    ends.push(now.end);
    if (now.pass) passCount++;
    if (extra && now.pass && !verdict(0).pass) newlyPassing.push(e.student.name);
  }
  const n = ends.length;
  const mean = n ? ends.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n ? Math.sqrt(ends.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
  const stat: PaperStat = { n, mean: round(mean, 2), meanPct: round((mean / endMax) * 100, 1), sd: round(sd, 2), passCount, passPct: n ? round((passCount / n) * 100, 1) : 0 };
  return { stat, newlyPassing, endMax, paper };
}

export async function moderationOverview(examId: string) {
  const cfg = await moderationRule();
  const papers = await db.examPaper.findMany({ where: { examId }, include: { course: true, scripts: { select: { status: true } }, moderations: { orderBy: { proposedAt: "desc" } } }, orderBy: { course: { code: "asc" } } });
  const rows = [];
  for (const p of papers) {
    const { stat, endMax } = await statsFor(p.id);
    const reasons: string[] = [];
    if (cfg && stat.n) {
      if (stat.passPct < cfg.p.flagPassPctBelow) reasons.push(`pass rate ${stat.passPct}% < ${cfg.p.flagPassPctBelow}%`);
      if (stat.meanPct < cfg.p.flagMeanPctBelow) reasons.push(`mean ${stat.meanPct}% < ${cfg.p.flagMeanPctBelow}%`);
    }
    rows.push({
      paperId: p.id, code: p.course.code, title: p.course.title, endMax, stat, reasons,
      finalised: p.scripts.length > 0 && p.scripts.every((s) => s.status === "FINALISED"), scripts: p.scripts.length,
      maxAdd: cfg ? Math.floor(((endMax * cfg.p.maxAddPct) / 100) * 2) / 2 : 0,
      actions: p.moderations,
    });
  }
  return { cfg, rows };
}

export async function proposeModeration(examId: string, paperId: string, delta: number, reason: string, actor: Actor) {
  const cfg = await moderationRule();
  if (!cfg) return { error: "No moderation rule is configured." };
  if (await resultsStarted(examId)) return { error: "Results have already been processed for this examination; moderation must precede result processing." };
  const paper = await db.examPaper.findUniqueOrThrow({ where: { id: paperId }, include: { course: true, scripts: true, moderations: true } });
  if (!paper.scripts.length || paper.scripts.some((s) => s.status !== "FINALISED")) return { error: "All scripts of the paper must be finalised before moderation." };
  if (paper.moderations.some((m) => m.status !== "REJECTED")) return { error: "This paper already has a moderation proposal or decision." };
  const { endMax, stat: before } = await statsFor(paperId);
  const cap = Math.floor(((endMax * cfg.p.maxAddPct) / 100) * 2) / 2;
  if (!(delta > 0) || delta > cap || Math.abs(delta * 2 - Math.round(delta * 2)) > 1e-9) return { error: `The addition must be between 0.5 and ${cap} marks (${cfg.p.maxAddPct}% of ${endMax}), in steps of 0.5.` };
  if (reason.trim().length < 15) return { error: "Record the Moderation Board's reasoning (at least a sentence)." };
  const { stat: after, newlyPassing } = await statsFor(paperId, delta);
  const action = await db.moderationAction.create({
    data: {
      examId, examPaperId: paperId, delta, reason: reason.trim(), ruleVersion: cfg.rule.version, proposedById: actor.id,
      before: before as unknown as Prisma.InputJsonValue, after: { ...after, newlyPassing } as unknown as Prisma.InputJsonValue,
    },
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "MODERATION_PROPOSED", entity: "ModerationAction", entityId: action.id,
    summary: `${paper.course.code}: +${delta} to every candidate's end-semester mark proposed — pass rate ${before.passPct}% → ${after.passPct}%, mean ${before.meanPct}% → ${after.meanPct}%`,
    before, after,
  });
  return { ok: true };
}

export async function decideModeration(actionId: string, approve: boolean, note: string, actor: Actor) {
  const cfg = await moderationRule();
  if (!cfg) return { error: "No moderation rule is configured." };
  const action = await db.moderationAction.findUniqueOrThrow({ where: { id: actionId }, include: { examPaper: { include: { course: { include: { scheme: { include: { components: true } } } }, exam: true } } } });
  if (action.status !== "PROPOSED") return { error: "This proposal has already been decided." };
  if (actor.role !== cfg.p.approvalAuthority) return { error: `Only the ${cfg.p.approvalAuthority === "VC" ? "Vice-Chancellor" : cfg.p.approvalAuthority} can approve moderation under ${cfg.rule.key}.` };
  if (actor.id === action.proposedById) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "SEGREGATION_VIOLATION_BLOCKED", entity: "ModerationAction", entityId: actionId, summary: "Moderation approval by its own proposer was blocked" });
    return { error: "The proposer cannot approve their own moderation." };
  }
  if (approve && (await resultsStarted(action.examId))) return { error: "Results have already been processed; moderation can no longer be applied." };
  const code = action.examPaper.course.code;
  let applied = 0;
  if (approve) {
    const end = action.examPaper.course.scheme.components.find((c) => c.source === "EXAM")!;
    const res = await db.markEntry.updateMany({
      where: { componentId: end.id, absent: false, marks: { not: null }, enrolment: { courseId: action.examPaper.courseId, academicYear: action.examPaper.exam.academicYear } },
      data: { moderation: action.delta },
    });
    applied = res.count;
  }
  await db.moderationAction.update({ where: { id: actionId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: note || null } });
  const after = action.after as unknown as PaperStat;
  await audit({
    actorId: actor.id, actorRole: actor.role, action: approve ? "MODERATION_APPROVED" : "MODERATION_REJECTED", entity: "ModerationAction", entityId: actionId,
    summary: approve
      ? `${code}: +${action.delta} moderation approved and applied to ${applied} candidates (pass rate now ${after.passPct}%); raw evaluated marks retained`
      : `${code}: moderation proposal rejected${note ? ` — ${note}` : ""}`,
  });
  return { ok: true, applied };
}
