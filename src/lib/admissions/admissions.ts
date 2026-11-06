import { randomBytes } from "node:crypto";
import type { Application } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, SEAT_LABELS, docsFor, isRelaxed, type DocSpec, type Marks, type MeritRule, type SeatMatrix } from "./shared";

type Actor = { id: string; role: string };

export async function loadCycle(cycleId: string) {
  const cycle = await db.admissionCycle.findUniqueOrThrow({ where: { id: cycleId }, include: { programme: true } });
  const raw = cycle.seatMatrix as unknown as SeatMatrix;
  const order = Object.keys(SEAT_LABELS);
  const seats = Object.fromEntries(Object.entries(raw).sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)));
  return { ...cycle, rule: cycle.meritRule as unknown as MeritRule, seats, docs: cycle.requiredDocs as unknown as DocSpec[] };
}
export type Cycle = Awaited<ReturnType<typeof loadCycle>>;

export function eligibilityOf(a: Pick<Application, "qualifyingDegree" | "qualifyingPct" | "category" | "pwd">, rule: MeritRule) {
  const min = isRelaxed(a) ? rule.eligibility.relaxedMinPct : rule.eligibility.minPct;
  const ok = a.qualifyingPct >= min;
  return { ok, min, detail: `${rule.eligibility.degree} with ${a.qualifyingPct}% — minimum ${min}%${isRelaxed(a) ? " (relaxed)" : ""}` };
}

export function qualifies(a: { category: string; pwd: boolean; marks: unknown }, rule: MeritRule) {
  const comp = rule.components.find((c) => c.code === rule.qualifying.code)!;
  const v = (a.marks as Marks | null)?.[comp.code];
  if (v == null) return null;
  return (v / comp.max) * 100 >= (isRelaxed(a) ? rule.qualifying.relaxedPct : rule.qualifying.pct);
}

export function compositeOf(marks: Marks | null, rule: MeritRule) {
  if (!marks || rule.components.some((c) => marks[c.code] == null)) return null;
  return Math.round(rule.components.reduce((s, c) => s + (marks[c.code] / c.max) * c.weight, 0) * 100) / 100;
}

/** Open-merit seats are filled first irrespective of category; reserved seats then go to the next candidates of that category. */
export function allot<T extends { id: string; category: string }>(ranked: T[], seats: SeatMatrix) {
  const result = new Map<string, string>();
  for (const c of ranked.slice(0, seats.UR ?? 0)) result.set(c.id, "UR");
  for (const [cat, n] of Object.entries(seats)) {
    if (cat === "UR") continue;
    ranked.filter((c) => c.category === cat && !result.has(c.id)).slice(0, n).forEach((c) => result.set(c.id, cat));
  }
  return result;
}

export async function cycleOverview(cycleId: string) {
  const cycle = await loadCycle(cycleId);
  const apps = await db.application.findMany({ where: { cycleId }, include: { documents: { select: { code: true, status: true } } }, orderBy: [{ meritRank: "asc" }, { appNo: "asc" }] });
  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const live = apps.filter((a) => a.status === "VERIFIED");
  const testCode = cycle.rule.qualifying.code;
  const qualified = live.filter((a) => qualifies(a, cycle.rule));
  const pendingMarks = live.filter((a) => (a.marks as Marks | null)?.[testCode] == null || (qualifies(a, cycle.rule) && compositeOf(a.marks as Marks, cycle.rule) == null));
  const seatFill = Object.entries(cycle.seats).map(([cat, n]) => ({
    cat, label: SEAT_LABELS[cat] ?? cat, seats: n,
    offered: apps.filter((a) => a.seatCategory === cat && a.outcome === "OFFERED").length,
    admitted: apps.filter((a) => a.seatCategory === cat && a.outcome === "ADMITTED").length,
  }));
  return {
    cycle, apps,
    counts: { total: apps.length, submitted: apps.filter((a) => a.status !== "DRAFT").length, toVerify: count("SUBMITTED"), returned: count("RETURNED"), verified: live.length, rejected: count("REJECTED") },
    qualified: qualified.length, pendingMarks, seatFill, seatsTotal: Object.values(cycle.seats).reduce((a, b) => a + b, 0),
  };
}

async function refreshStatus(applicationId: string, actor: Actor) {
  const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { documents: true, cycle: true } });
  if (!["SUBMITTED", "RETURNED", "VERIFIED"].includes(app.status)) return app.status;
  const required = docsFor(app.cycle.requiredDocs as unknown as DocSpec[], app);
  const docs = required.map((r) => app.documents.find((d) => d.code === r.code));
  const next = docs.some((d) => d?.status === "REJECTED") ? "RETURNED" : docs.every((d) => d?.status === "ACCEPTED") ? "VERIFIED" : "SUBMITTED";
  if (next !== app.status) {
    await db.application.update({ where: { id: app.id }, data: { status: next, verifiedAt: next === "VERIFIED" ? new Date() : null } });
    await audit({
      actorId: actor.id, actorRole: actor.role, action: next === "VERIFIED" ? "APPLICATION_VERIFIED" : next === "RETURNED" ? "APPLICATION_RETURNED" : "APPLICATION_RESUBMITTED",
      entity: "Application", entityId: app.id,
      summary: `${app.appNo} (${app.name}): ${next === "VERIFIED" ? "all documents verified" : next === "RETURNED" ? "returned to the applicant for correction" : "corrected documents received for verification"}`,
    });
  }
  return next;
}

export async function reviewDocument(docId: string, decision: "ACCEPT" | "REJECT", remark: string, actor: Actor) {
  const doc = await db.applicationDocument.findUnique({ where: { id: docId }, include: { application: { include: { cycle: true } } } });
  if (!doc) return { error: "Document not found." };
  if (!["SUBMITTED", "RETURNED", "VERIFIED"].includes(doc.application.status)) return { error: "This application is not open for verification." };
  if (doc.application.outcome) return { error: "The merit list has been published; documents are locked." };
  if (decision === "REJECT" && remark.trim().length < 5) return { error: "Tell the applicant what is wrong with the document." };
  await db.applicationDocument.update({
    where: { id: doc.id },
    data: { status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED", remark: decision === "REJECT" ? remark.trim() : null, verifiedById: actor.id, verifiedAt: new Date() },
  });
  const label = (doc.application.cycle.requiredDocs as unknown as DocSpec[]).find((d) => d.code === doc.code)?.label ?? doc.code;
  await audit({
    actorId: actor.id, actorRole: actor.role, action: decision === "ACCEPT" ? "DOCUMENT_ACCEPTED" : "DOCUMENT_REJECTED", entity: "Application", entityId: doc.applicationId,
    summary: `${doc.application.appNo}: ${label} (v${doc.version}) ${decision === "ACCEPT" ? "accepted" : `rejected — ${remark.trim()}`}`,
  });
  const status = await refreshStatus(doc.applicationId, actor);
  return { ok: true, status };
}

export async function rejectApplication(applicationId: string, reason: string, actor: Actor) {
  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) return { error: "Application not found." };
  if (app.outcome) return { error: "The merit list has been published." };
  if (reason.trim().length < 10) return { error: "Record the reason for rejection." };
  await db.application.update({ where: { id: app.id }, data: { status: "REJECTED", remarks: reason.trim() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "APPLICATION_REJECTED", entity: "Application", entityId: app.id, summary: `${app.appNo} (${app.name}) rejected: ${reason.trim()}` });
  return { ok: true };
}

export async function uploadDocument(applicationId: string, code: string, file: File, actor: Actor) {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { cycle: true, documents: true } });
  if (!app) return { error: "Application not found." };
  const spec = docsFor(app.cycle.requiredDocs as unknown as DocSpec[], app).find((d) => d.code === code);
  if (!spec) return { error: "This document is not required for your application." };
  if (!ALLOWED_MIME.includes(file.type)) return { error: "Upload a PDF, JPG or PNG file." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "The file is larger than 2 MB." };
  if (file.size === 0) return { error: "The file is empty." };
  const existing = app.documents.find((d) => d.code === code);
  if (existing?.status === "ACCEPTED") return { error: "This document has already been accepted." };
  if (app.status === "REJECTED" || app.outcome) return { error: "Your application can no longer be changed." };
  const data = Buffer.from(await file.arrayBuffer());
  await db.applicationDocument.upsert({
    where: { applicationId_code: { applicationId, code } },
    create: { applicationId, code, fileName: file.name, mime: file.type, size: file.size, data },
    update: { fileName: file.name, mime: file.type, size: file.size, data, status: "PENDING", remark: null, verifiedById: null, verifiedAt: null, version: { increment: 1 }, uploadedAt: new Date() },
  });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "DOCUMENT_UPLOADED", entity: "Application", entityId: app.id, summary: `${app.appNo}: ${spec.label} uploaded (${file.name}, ${Math.ceil(file.size / 1024)} KB)${existing ? `, version ${existing.version + 1}` : ""}` });
  await refreshStatus(app.id, actor);
  return { ok: true };
}

export async function saveMarks(cycleId: string, entries: { applicationId: string; code: string; value: number | null }[], actor: Actor) {
  const cycle = await loadCycle(cycleId);
  if (cycle.status !== "EVALUATION") return { error: "Marks can be entered only while the cycle is under evaluation." };
  const apps = await db.application.findMany({ where: { cycleId, id: { in: entries.map((e) => e.applicationId) } } });
  let changed = 0;
  for (const app of apps) {
    const marks = { ...((app.marks as Marks | null) ?? {}) };
    for (const e of entries.filter((x) => x.applicationId === app.id)) {
      const comp = cycle.rule.components.find((c) => c.code === e.code);
      if (!comp) continue;
      if (e.value != null && (Number.isNaN(e.value) || e.value < 0 || e.value > comp.max)) return { error: `${app.appNo}: ${comp.label} must be between 0 and ${comp.max}.` };
      if (e.value == null) delete marks[e.code];
      else marks[e.code] = Math.round(e.value * 2) / 2;
    }
    if (JSON.stringify(marks) !== JSON.stringify(app.marks ?? {})) {
      await db.application.update({ where: { id: app.id }, data: { marks, composite: compositeOf(marks, cycle.rule) } });
      changed++;
    }
  }
  if (changed) await audit({ actorId: actor.id, actorRole: actor.role, action: "ADMISSION_MARKS_SAVED", entity: "AdmissionCycle", entityId: cycleId, summary: `${cycle.code}: marks saved for ${changed} candidate(s)` });
  return { ok: true, changed };
}

/** Ranked list of verified candidates with composite scores; does not write anything. */
export async function meritPreview(cycleId: string) {
  const cycle = await loadCycle(cycleId);
  const apps = await db.application.findMany({ where: { cycleId, status: "VERIFIED" } });
  const rows = apps.map((a) => ({ ...a, qualified: qualifies(a, cycle.rule), composite: compositeOf(a.marks as Marks | null, cycle.rule) }));
  const test = cycle.rule.qualifying.code;
  const ranked = rows
    .filter((a) => a.qualified && a.composite != null && a.outcome !== "DECLINED")
    .sort((a, b) => b.composite! - a.composite! || ((b.marks as Marks)[test] ?? 0) - ((a.marks as Marks)[test] ?? 0) || b.qualifyingPct - a.qualifyingPct || a.dob.getTime() - b.dob.getTime());
  const seats = allot(ranked, cycle.seats);
  const blockers = rows.filter((a) => a.qualified == null || (a.qualified && a.composite == null));
  return { cycle, ranked: ranked.map((a, i) => ({ ...a, rank: a.meritRank ?? i + 1, seat: seats.get(a.id) ?? null })), notQualified: rows.filter((a) => a.qualified === false), blockers };
}

export async function publishMerit(cycleId: string, actor: Actor) {
  const p = await meritPreview(cycleId);
  if (p.cycle.status !== "EVALUATION") return { error: "The merit list has already been published." };
  if (p.blockers.length) return { error: `${p.blockers.length} candidate(s) still have marks pending.` };
  const pending = await db.application.count({ where: { cycleId, status: { in: ["SUBMITTED", "RETURNED"] } } });
  const deadline = new Date(Date.now() + 7 * 86400000);
  await db.$transaction([
    ...p.ranked.map((a) => db.application.update({ where: { id: a.id }, data: { composite: a.composite, meritRank: a.rank, outcome: a.seat ? "OFFERED" : "WAITLISTED", seatCategory: a.seat } })),
    ...p.notQualified.map((a) => db.application.update({ where: { id: a.id }, data: { outcome: "NOT_QUALIFIED" } })),
    db.admissionCycle.update({ where: { id: cycleId }, data: { status: "MERIT_PUBLISHED", meritPublishedAt: new Date(), offerDeadline: deadline } }),
  ]);
  const offers = p.ranked.filter((a) => a.seat).length;
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "MERIT_LIST_PUBLISHED", entity: "AdmissionCycle", entityId: cycleId,
    summary: `${p.cycle.code}: merit list of ${p.ranked.length} published; ${offers} seat offer(s) made, ${p.ranked.length - offers} waitlisted, ${p.notQualified.length} not qualified${pending ? `; ${pending} unverified application(s) excluded` : ""}`,
  });
  return { ok: true, offers, waitlisted: p.ranked.length - offers };
}

/** Re-runs the allotment after a seat is vacated: everyone keeps or improves their position and the next eligible candidate gets an offer. */
async function refillSeats(cycleId: string, actor: Actor) {
  const p = await meritPreview(cycleId);
  const newOffers: string[] = [];
  for (const a of p.ranked) {
    const outcome = a.outcome === "ADMITTED" ? "ADMITTED" : a.seat ? "OFFERED" : "WAITLISTED";
    if (outcome !== a.outcome || a.seat !== a.seatCategory) {
      await db.application.update({ where: { id: a.id }, data: { outcome, seatCategory: a.seat } });
      if (outcome === "OFFERED" && a.outcome !== "OFFERED") newOffers.push(`${a.name} (rank ${a.meritRank}, ${SEAT_LABELS[a.seat!]})`);
    }
  }
  if (newOffers.length) await audit({ actorId: actor.id, actorRole: actor.role, action: "SEAT_REALLOTTED", entity: "AdmissionCycle", entityId: cycleId, summary: `Vacated seat re-allotted: offer made to ${newOffers.join(", ")}` });
  return newOffers;
}

export async function respondToOffer(applicationId: string, accept: boolean, actor: Actor) {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { cycle: { include: { programme: true } } } });
  if (!app || app.outcome !== "OFFERED") return { error: "There is no open offer on this application." };
  if (app.cycle.offerDeadline && app.cycle.offerDeadline < new Date()) return { error: "The offer has lapsed." };
  if (!accept) {
    await db.application.update({ where: { id: app.id }, data: { outcome: "DECLINED", seatCategory: null, decidedAt: new Date() } });
    await audit({ actorId: actor.id, actorRole: actor.role, action: "OFFER_DECLINED", entity: "Application", entityId: app.id, summary: `${app.appNo} (${app.name}) declined the offer` });
    const next = await refillSeats(app.cycleId, actor);
    return { ok: true, next };
  }

  const programme = app.cycle.programme;
  const year = Number(app.cycle.academicYear.slice(0, 4));
  const code = `${programme.code}-${year}`;
  let batch = await db.batch.findUnique({ where: { code } });
  if (!batch) {
    const curriculum = await db.curriculumVersion.findFirstOrThrow({ where: { programmeId: programme.id }, orderBy: { effectiveFrom: "desc" } });
    batch = await db.batch.create({ data: { code, name: `${programme.code === "PHD" ? "Ph.D." : programme.name} ${app.cycle.academicYear.replace("-", "–")}`, programmeId: programme.id, curriculumVersionId: curriculum.id, admissionYear: year, currentSemester: 1 } });
  }
  const seq = (await db.student.count({ where: { batchId: batch.id } })) + 1;
  const prefix = { BALLB: "BAL", LLM: "LLM", PHD: "PHD" }[programme.code] ?? programme.code;
  const [first, ...rest] = app.name.toLowerCase().replace(/[^a-z ]/g, "").split(" ");
  const feeRef = `PAY${randomBytes(5).toString("hex").toUpperCase()}`;
  const student = await db.student.create({
    data: {
      uid: `NLUJA${year}${String(8000 + seq)}`, rollNo: `${prefix}${String(year).slice(2)}-${String(seq).padStart(3, "0")}`, name: app.name, gender: app.gender, dob: app.dob,
      email: `${first}.${rest.at(-1) ?? "scholar"}.${prefix.toLowerCase()}${String(year).slice(2)}@students.nluassam.ac.in`, phone: app.phone, category: app.category,
      parentName: app.parentName, batchId: batch.id, status: "ACTIVE",
    },
  });
  await db.application.update({ where: { id: app.id }, data: { outcome: "ADMITTED", studentId: student.id, admissionFeeRef: feeRef, decidedAt: new Date() } });
  if (app.userId) await db.user.update({ where: { id: app.userId }, data: { role: "STUDENT", studentId: student.id, designation: `${batch.name} — Research Scholar` } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "STUDENT_ADMITTED", entity: "Student", entityId: student.id,
    summary: `${app.appNo} (${app.name}) accepted the ${SEAT_LABELS[app.seatCategory!]} seat and paid the admission fee ₹${app.cycle.admissionFee} (${feeRef}); enrolled as ${student.rollNo}, University ID ${student.uid}`,
  });
  return { ok: true, rollNo: student.rollNo, uid: student.uid };
}
