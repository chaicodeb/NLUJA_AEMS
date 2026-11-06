import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { stableStringify } from "../utils";
import { UNITS, blocking, runChecks, type QPContent } from "./question-paper-checks";

export type QPStatus = "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED" | "SEALED" | "RELEASED";
export const QP_STEPS: { status: QPStatus; label: string }[] = [
  { status: "DRAFT", label: "Drafting" },
  { status: "SUBMITTED", label: "With moderator" },
  { status: "APPROVED", label: "Moderated" },
  { status: "SEALED", label: "Sealed" },
  { status: "RELEASED", label: "Released for printing" },
];
export const QP_LABEL: Record<QPStatus | "NOT_STARTED", string> = {
  NOT_STARTED: "Not started", DRAFT: "Draft", SUBMITTED: "Awaiting moderation", CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Moderated", SEALED: "Sealed", RELEASED: "Released",
};
export const QP_TONE: Record<QPStatus | "NOT_STARTED", "neutral" | "brand" | "green" | "blue" | "amber" | "red" | "violet"> = {
  NOT_STARTED: "neutral", DRAFT: "blue", SUBMITTED: "amber", CHANGES_REQUESTED: "red", APPROVED: "violet", SEALED: "brand", RELEASED: "green",
};
/** Sealed papers can be released for printing this many minutes before the paper starts. */
export const RELEASE_LEAD_MINS = 60;
const MODERATORS = ["HOD", "COE"];

const KEY = createHash("sha256").update(`question-paper:${process.env.QP_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "dev"}`).digest();

export function encryptContent(c: QPContent) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(c), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptContent(body: string): QPContent {
  const [, iv, tag, enc] = body.split(":");
  const d = createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8"));
}

export const hashContent = (c: QPContent) => createHash("sha256").update(stableStringify(c)).digest("hex");

type Actor = { id: string; role: string; name?: string };
type PaperRow = Prisma.ExamPaperGetPayload<{ include: { course: true; exam: true; setter: true; questionPaper: true } }>;

export async function loadPaper(examPaperId: string) {
  return db.examPaper.findUnique({ where: { id: examPaperId }, include: { course: true, exam: true, setter: true, questionPaper: true } });
}

export function releaseOpensAt(p: { date: Date }) {
  return new Date(p.date.getTime() - RELEASE_LEAD_MINS * 60000);
}

/** Who may do what with one paper. Content is confidential: setter, moderators (HOD) and the COE only — Examination Branch sees it once released. */
export function qpRights(user: Actor, p: PaperRow, now: Date) {
  const qp = p.questionPaper;
  const status = (qp?.status ?? "NOT_STARTED") as QPStatus | "NOT_STARTED";
  const isSetter = p.setterId === user.id;
  const viewContent = !!qp && (isSetter || MODERATORS.includes(user.role) || (user.role === "EXAM_STAFF" && status === "RELEASED"));
  return {
    status, isSetter, viewContent,
    start: isSetter && !qp,
    edit: isSetter && (status === "DRAFT" || status === "CHANGES_REQUESTED"),
    moderate: MODERATORS.includes(user.role) && !isSetter && status === "SUBMITTED",
    seal: user.role === "COE" && status === "APPROVED",
    release: ["COE", "EXAM_STAFF"].includes(user.role) && status === "SEALED" && now >= releaseOpensAt(p),
  };
}

export const rightsNow = (user: Actor, p: PaperRow) => qpRights(user, p, new Date());

/** Papers listed on the Question Papers screen: faculty see only the papers they set. */
export async function listPapers(user: Actor) {
  return db.examPaper.findMany({
    where: { exam: { status: { not: "PLANNED" } }, ...(user.role === "FACULTY" ? { setterId: user.id } : {}) },
    include: { course: true, exam: true, setter: true, questionPaper: true },
    orderBy: [{ exam: { startDate: "desc" } }, { date: "asc" }, { session: "asc" }],
  });
}

export function contextFor(p: PaperRow) {
  return {
    maxMarks: p.maxMarks, durationMins: p.durationMins,
    scheme: (p.questionScheme as { q: string; max: number }[] | null) ?? null,
    setterName: p.setter?.name ?? null,
  };
}

export function checksFor(p: PaperRow, c: QPContent) {
  return runChecks(c, contextFor(p));
}

export function templateFor(p: PaperRow): QPContent {
  const scheme = (p.questionScheme as { q: string; max: number }[] | null) ?? [];
  const rows = scheme.length ? scheme : Array.from({ length: 5 }, (_, k) => ({ q: `Q${k + 1}`, max: Math.round(p.maxMarks / 5) }));
  return {
    instructions: "Answer all questions. Each question has an internal choice — attempt either (a) or (b). Figures in the right margin indicate full marks. Unannotated bare acts are permitted.",
    questions: rows.map((r, i) => ({ no: r.q, unit: UNITS[i % UNITS.length], marks: r.max, text: "", orText: "" })),
  };
}

async function guard(p: PaperRow | null, user: Actor, allowed: boolean, what: string) {
  if (p && allowed) return null;
  await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "QuestionPaper", entityId: p?.questionPaper?.id ?? p?.id ?? null, summary: `Not permitted to ${what} question paper${p ? ` ${p.course.code}` : ""}` });
  return { error: `You are not permitted to ${what} this question paper.` };
}

export async function startPaper(examPaperId: string, user: Actor) {
  const p = await loadPaper(examPaperId);
  const denied = await guard(p, user, !!p && qpRights(user, p, new Date()).start, "start");
  if (denied) return denied;
  const content = templateFor(p!);
  const qp = await db.questionPaper.create({ data: { examPaperId, body: encryptContent(content), contentHash: hashContent(content) } });
  await audit({ actorId: user.id, actorRole: user.role, action: "QP_STARTED", entity: "QuestionPaper", entityId: qp.id, summary: `${p!.course.code} question paper drafting started by the setter` });
  return { ok: true };
}

export async function saveDraft(examPaperId: string, content: QPContent, user: Actor) {
  const p = await loadPaper(examPaperId);
  const denied = await guard(p, user, !!p && qpRights(user, p, new Date()).edit, "edit");
  if (denied) return denied;
  const qp = p!.questionPaper!;
  const hash = hashContent(content);
  if (hash === qp.contentHash) return { ok: true, unchanged: true };
  await db.questionPaper.update({ where: { id: qp.id }, data: { body: encryptContent(content), contentHash: hash } });
  const fails = blocking(checksFor(p!, content)).length;
  await audit({
    actorId: user.id, actorRole: user.role, action: "QP_DRAFT_SAVED", entity: "QuestionPaper", entityId: qp.id,
    summary: `${p!.course.code} question paper draft saved (version ${qp.version}) — ${fails ? `${fails} check(s) failing` : "all blocking checks pass"}`,
    before: { contentHash: qp.contentHash }, after: { contentHash: hash },
  });
  return { ok: true };
}

export async function submitPaper(examPaperId: string, user: Actor) {
  const p = await loadPaper(examPaperId);
  const denied = await guard(p, user, !!p && qpRights(user, p, new Date()).edit, "submit");
  if (denied) return denied;
  const qp = p!.questionPaper!;
  const fails = blocking(checksFor(p!, decryptContent(qp.body)));
  if (fails.length) return { error: `Fix before submitting: ${fails.map((f) => f.label.toLowerCase()).join("; ")}` };
  const version = qp.status === "CHANGES_REQUESTED" ? qp.version + 1 : qp.version;
  await db.questionPaper.update({ where: { id: qp.id }, data: { status: "SUBMITTED", version, submittedAt: new Date() } });
  await audit({
    actorId: user.id, actorRole: user.role, action: "QP_SUBMITTED", entity: "QuestionPaper", entityId: qp.id,
    summary: `${p!.course.code} question paper version ${version} submitted for moderation`, after: { status: "SUBMITTED", version, contentHash: qp.contentHash },
  });
  return { ok: true };
}

export async function moderatePaper(examPaperId: string, decision: "APPROVED" | "CHANGES_REQUESTED", note: string, user: Actor & { name: string }) {
  const p = await loadPaper(examPaperId);
  const denied = await guard(p, user, !!p && qpRights(user, p, new Date()).moderate, "moderate");
  if (denied) return denied;
  if (decision === "CHANGES_REQUESTED" && note.trim().length < 10) return { error: "Tell the setter what to change (at least a sentence)." };
  const qp = p!.questionPaper!;
  if (decision === "APPROVED" && blocking(checksFor(p!, decryptContent(qp.body))).length) return { error: "Blocking checks are failing — request changes instead." };
  await db.questionPaper.update({ where: { id: qp.id }, data: { status: decision, moderatorId: user.id, moderatorName: user.name, moderatorNote: note.trim() || null, moderatedAt: new Date() } });
  await audit({
    actorId: user.id, actorRole: user.role, action: decision === "APPROVED" ? "QP_MODERATED" : "QP_CHANGES_REQUESTED", entity: "QuestionPaper", entityId: qp.id,
    summary: decision === "APPROVED" ? `${p!.course.code} question paper version ${qp.version} approved by the moderator${note ? ` — ${note.trim()}` : ""}` : `${p!.course.code} question paper returned to the setter — ${note.trim()}`,
    before: { status: qp.status }, after: { status: decision },
  });
  return { ok: true };
}

export async function sealPaper(examPaperId: string, user: Actor) {
  const p = await loadPaper(examPaperId);
  const denied = await guard(p, user, !!p && qpRights(user, p, new Date()).seal, "seal");
  if (denied) return denied;
  const qp = p!.questionPaper!;
  const content = decryptContent(qp.body);
  if (blocking(checksFor(p!, content)).length) return { error: "Blocking checks are failing — the paper cannot be sealed." };
  const scheme = content.questions.map((q) => ({ q: q.no, max: q.marks }));
  const scripts = await db.answerScript.count({ where: { examPaperId } });
  const schemeChanged = stableStringify(scheme) !== stableStringify(p!.questionScheme ?? []);
  await db.$transaction([
    db.questionPaper.update({ where: { id: qp.id }, data: { status: "SEALED", sealedAt: new Date() } }),
    ...(schemeChanged && !scripts ? [db.examPaper.update({ where: { id: examPaperId }, data: { questionScheme: scheme } })] : []),
  ]);
  await audit({
    actorId: user.id, actorRole: user.role, action: "QP_SEALED", entity: "QuestionPaper", entityId: qp.id,
    summary: `${p!.course.code} question paper sealed — fingerprint ${qp.contentHash.slice(0, 16)}; locked until release at ${releaseOpensAt(p!).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST${schemeChanged && !scripts ? "; evaluators' marking scheme regenerated from the paper" : ""}`,
    before: { status: qp.status }, after: { status: "SEALED", contentHash: qp.contentHash },
  });
  return { ok: true };
}

export async function releasePaper(examPaperId: string, user: Actor) {
  const p = await loadPaper(examPaperId);
  const denied = await guard(p, user, !!p && qpRights(user, p, new Date()).release, "release");
  if (denied) return denied;
  const qp = p!.questionPaper!;
  const intact = hashContent(decryptContent(qp.body)) === qp.contentHash;
  if (!intact) return { error: "Integrity check failed — the sealed content does not match its fingerprint. Do not print; inform the COE." };
  await db.questionPaper.update({ where: { id: qp.id }, data: { status: "RELEASED", releasedAt: new Date() } });
  await audit({
    actorId: user.id, actorRole: user.role, action: "QP_RELEASED", entity: "QuestionPaper", entityId: qp.id,
    summary: `${p!.course.code} question paper released for printing at the examination centre; fingerprint ${qp.contentHash.slice(0, 16)} verified`,
    before: { status: "SEALED" }, after: { status: "RELEASED" },
  });
  return { ok: true };
}

/** Logs a view of the confidential content (at most once per person per paper every 10 minutes). */
export async function logContentView(qpId: string, code: string, user: Actor & { name: string }) {
  const recent = await db.auditLog.findFirst({ where: { action: "QP_VIEWED", entityId: qpId, actorId: user.id, at: { gte: new Date(Date.now() - 10 * 60000) } } });
  if (!recent) await audit({ actorId: user.id, actorRole: user.role, action: "QP_VIEWED", entity: "QuestionPaper", entityId: qpId, summary: `${code} question paper content viewed by ${user.name}` });
}
