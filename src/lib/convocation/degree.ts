import { randomBytes } from "node:crypto";
import { db } from "../db";
import { audit } from "../audit";
import { issueDocument } from "../docs";
import { asParams, divisionFor, type GradingParams } from "../rules/engine";
import { getActiveRule } from "../rules/store";
import { firstPerSemester, PUBLISHED_ORDER } from "../results/engine";
import type { MessageKey } from "../i18n/messages";
import { makeT, type Vars } from "../i18n/translate";

type Actor = { id: string; role: string };
export type Medal = { code: string; name: string; description: string; criterion: { type: "HIGHEST_CGPA"; programme?: string } | { type: "HIGHEST_TOTAL"; courses: string[] } };
export type Check = { label: string; ok: boolean; detail: string; labelMsg?: [MessageKey, Vars?]; detailMsg?: [MessageKey, Vars?] };
const en = makeT("en");
export const DEPARTMENTS: Record<string, string> = { LIBRARY: "Library", HOSTEL: "Hostel", ACCOUNTS: "Accounts", EXAMINATION: "Examination Branch" };

export type DegreePayload = {
  kind: "DEGREE" | "PROVISIONAL";
  serialNo: string | null;
  student: { name: string; rollNo: string; uid: string; abcId: string | null };
  degree: string;
  programme: string;
  batch: string;
  cgpa: number;
  division: string | null;
  yearOfPassing: string;
  convocation: { number: number; title: string; date: string } | null;
  medals: string[];
  signatory: { name: string; designation: string };
  issuedOn: string;
};

async function grading() {
  const rule = await getActiveRule("GRADING");
  return rule ? asParams<GradingParams>(rule) : null;
}

/** Everything that decides whether a student can be admitted to the degree. */
export async function degreeStatus(studentId: string) {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: { include: { programme: true, curriculumVersion: true } }, clearances: true } });
  const all = await db.semesterResult.findMany({ where: { studentId, run: { status: "PUBLISHED" } }, orderBy: PUBLISHED_ORDER, include: { run: { include: { exam: true } } } });
  const sems = firstPerSemester(all);
  const duration = student.batch.programme.durationSemesters;
  const required = student.batch.curriculumVersion.totalCredits ?? 0;
  const earned = sems.reduce((a, s) => a + s.earnedCredits, 0);
  const backlogs = sems.filter((s) => s.result !== "PASS");
  const last = sems.at(-1);
  const g = await grading();
  const minCgpa = g?.degreeMinCgpa ?? 5;
  const cgpa = last?.cgpa ?? 0;
  const dues = Object.keys(DEPARTMENTS).map((d) => ({ department: d, row: student.clearances.find((c) => c.department === d) }));
  const pendingDues = dues.filter((d) => d.row?.status !== "CLEARED");
  const check = (ok: boolean, label: [MessageKey, Vars?], detail: [MessageKey, Vars?] | string): Check => ({
    ok, label: en(...label), detail: typeof detail === "string" ? detail : en(...detail), labelMsg: label, detailMsg: typeof detail === "string" ? undefined : detail,
  });
  const checks: Check[] = [
    check(sems.length >= duration, ["All {n} semesters completed", { n: duration }], ["{done} of {n} semester results published", { done: sems.length, n: duration }]),
    check(backlogs.length === 0, ["No backlog"], backlogs.length ? ["Backlog in semester {list}", { list: backlogs.map((b) => b.semester).join(", ") }] : ["Every semester passed"]),
    check(earned >= required, ["Credits ({n} required)", { n: required }], ["{n} credits earned", { n: earned }]),
    check(cgpa >= minCgpa, ["Minimum CGPA {n}", { n: minCgpa }], ["CGPA {n}", { n: cgpa.toFixed(2) }]),
    check(
      pendingDues.length === 0, ["No-dues clearance"],
      pendingDues.length ? pendingDues.map((d) => `${DEPARTMENTS[d.department]}${d.row?.amount ? ` ₹${d.row.amount}` : ""}${d.row?.status === "DUES" ? " outstanding" : " pending"}`).join(", ") : ["Library, hostel, accounts and examination cleared"],
    ),
  ];
  const eligible = checks.every((c) => c.ok);
  const academicOk = checks.slice(0, 4).every((c) => c.ok);
  const lastYear = student.batch.admissionYear + Math.ceil(duration / 2);
  return {
    student, checks, eligible, academicOk, cgpa, earned, required, sems, dues,
    division: eligible || academicOk ? (g ? divisionFor(g, cgpa) : null) : null,
    yearOfPassing: String(lastYear),
    firstAttempt: !all.some((s) => s.result !== "PASS") && !all.some((s) => s.run.exam.type !== "REGULAR"),
  };
}

export async function currentConvocation() {
  return db.convocation.findFirst({ orderBy: { number: "desc" } });
}

/** Students of batches that have reached the end of their programme. */
export async function graduands(convocationId: string) {
  const batches = (await db.batch.findMany({ include: { programme: true } })).filter((b) => b.currentSemester >= b.programme.durationSemesters);
  const students = await db.student.findMany({ where: { batchId: { in: batches.map((b) => b.id) }, status: { notIn: ["GRADUATED", "WITHDRAWN"] } }, orderBy: { rollNo: "asc" } });
  const apps = await db.degreeApplication.findMany({ where: { convocationId } });
  const rows = [];
  for (const s of students) rows.push({ ...(await degreeStatus(s.id)), application: apps.find((a) => a.studentId === s.id) ?? null });
  return rows;
}

/** Medal winners among eligible graduands who cleared every paper at the first attempt. */
export async function medalWinners(medals: Medal[], rows: Awaited<ReturnType<typeof graduands>>) {
  const pool = rows.filter((r) => r.eligible && r.firstAttempt);
  const out: { medal: Medal; winners: { studentId: string; name: string; score: string }[] }[] = [];
  for (const m of medals) {
    let scored: { studentId: string; name: string; value: number }[] = [];
    if (m.criterion.type === "HIGHEST_CGPA") scored = pool.map((r) => ({ studentId: r.student.id, name: r.student.name, value: r.cgpa }));
    else {
      const codes = m.criterion.courses;
      const results = await db.courseResult.findMany({ where: { studentId: { in: pool.map((r) => r.student.id) }, run: { status: "PUBLISHED" }, enrolment: { course: { code: { in: codes } } } }, include: { enrolment: { include: { course: true } } } });
      scored = pool.map((r) => ({ studentId: r.student.id, name: r.student.name, value: results.filter((x) => x.studentId === r.student.id).reduce((a, x) => a + x.total, 0) }));
    }
    const best = Math.max(...scored.map((s) => s.value), 0);
    out.push({ medal: m, winners: scored.filter((s) => s.value === best && best > 0).map((s) => ({ studentId: s.studentId, name: s.name, score: m.criterion.type === "HIGHEST_CGPA" ? `CGPA ${s.value.toFixed(2)}` : `${s.value} marks` })) });
  }
  return out;
}

export async function applyForDegree(studentId: string, mode: string, guests: number, method: string, actor: Actor) {
  const conv = await currentConvocation();
  if (!conv || conv.status !== "APPLICATIONS_OPEN") return { error: "Convocation applications are not open." };
  if (conv.applicationDeadline.getTime() < Date.now()) return { error: "The application deadline has passed." };
  if (!["IN_PERSON", "IN_ABSENTIA"].includes(mode)) return { error: "Choose in person or in absentia." };
  const status = await degreeStatus(studentId);
  if (!status.academicOk) return { error: `Not yet eligible: ${status.checks.filter((c) => !c.ok).map((c) => c.detail).join("; ")}.` };
  if (await db.degreeApplication.findUnique({ where: { convocationId_studentId: { convocationId: conv.id, studentId } } })) return { error: "You have already applied." };
  const g = mode === "IN_PERSON" ? Math.max(0, Math.min(2, Math.round(guests))) : 0;
  const fee = mode === "IN_PERSON" ? conv.feeInPerson : conv.feeInAbsentia;
  const app = await db.degreeApplication.create({ data: { convocationId: conv.id, studentId, mode, guests: g, fee, paymentRef: `${method}-${randomBytes(4).toString("hex").toUpperCase()}` } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "DEGREE_APPLIED", entity: "DegreeApplication", entityId: app.id, summary: `Applied to receive the degree ${mode === "IN_PERSON" ? `in person with ${g} guest pass(es)` : "in absentia"} at the ${conv.title}; fee ₹${fee} paid (${app.paymentRef})` });
  return { ok: true, fee };
}

export async function clearDues(studentId: string, department: string, receipt: string, actor: Actor) {
  if (!["REGISTRAR", "ADMIN"].includes(actor.role)) return { error: "Only the Registrar's office can record a clearance here." };
  if (receipt.trim().length < 3) return { error: "Enter the receipt or reference number." };
  const row = await db.clearance.findUnique({ where: { studentId_department: { studentId, department } }, include: { student: true } });
  if (!row || row.status === "CLEARED") return { error: "Nothing to clear." };
  await db.clearance.update({ where: { id: row.id }, data: { status: "CLEARED", note: `${row.amount ? `₹${row.amount} paid` : "Cleared"} — receipt ${receipt.trim()}`, updatedById: actor.id } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "DUES_CLEARED", entity: "Student", entityId: studentId, summary: `${row.student.name}: ${DEPARTMENTS[department]} no-dues cleared (${row.amount ? `₹${row.amount}, ` : ""}receipt ${receipt.trim()})` });
  return { ok: true };
}

/** Registrar freezes the graduand list after the Academic Council resolution; serial numbers are allotted in roll order. */
export async function freezeList(convocationId: string, resolution: string, actor: Actor) {
  if (!["REGISTRAR", "ADMIN"].includes(actor.role)) return { error: "Only the Registrar can freeze the graduand list." };
  const conv = await db.convocation.findUniqueOrThrow({ where: { id: convocationId } });
  if (conv.status !== "APPLICATIONS_OPEN") return { error: "The list is already frozen." };
  if (resolution.trim().length < 5) return { error: "Record the Academic Council resolution approving the degrees." };
  const apps = await db.degreeApplication.findMany({ where: { convocationId }, include: { student: { include: { batch: { include: { programme: true } } } } }, orderBy: { student: { rollNo: "asc" } } });
  let serial = 0;
  let approved = 0;
  for (const a of apps) {
    const s = await degreeStatus(a.studentId);
    if (s.eligible) {
      serial++;
      approved++;
      await db.degreeApplication.update({ where: { id: a.id }, data: { status: "APPROVED", reason: null, serialNo: `NLUJA/${a.student.batch.programme.code}/${s.yearOfPassing}/${String(serial).padStart(4, "0")}` } });
    } else {
      await db.degreeApplication.update({ where: { id: a.id }, data: { status: "NOT_ELIGIBLE", reason: s.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`).join("; ") } });
    }
  }
  await db.convocation.update({ where: { id: convocationId }, data: { status: "LIST_FROZEN", councilResolution: resolution.trim(), frozenAt: new Date(), frozenById: actor.id } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "GRADUAND_LIST_FROZEN", entity: "Convocation", entityId: convocationId, summary: `${conv.title}: graduand list frozen — ${approved} approved, ${apps.length - approved} not eligible (${resolution.trim()})` });
  return { ok: true, approved, rejected: apps.length - approved };
}

/** The Vice-Chancellor confers the degrees: one digitally signed, QR-verifiable certificate per approved graduand. */
export async function conferDegrees(convocationId: string, actor: Actor) {
  if (actor.role !== "VC") return { error: "Degrees are conferred under the Vice-Chancellor's signature." };
  const conv = await db.convocation.findUniqueOrThrow({ where: { id: convocationId } });
  if (conv.status !== "LIST_FROZEN") return { error: "Freeze the graduand list first." };
  const vc = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const apps = await db.degreeApplication.findMany({ where: { convocationId, status: "APPROVED" }, include: { student: { include: { batch: { include: { programme: true } } } } }, orderBy: { serialNo: "asc" } });
  const rows = await graduands(convocationId);
  const medals = await medalWinners(conv.medals as unknown as Medal[], rows);
  for (const a of apps) {
    const s = rows.find((r) => r.student.id === a.studentId)!;
    const payload: DegreePayload = {
      kind: "DEGREE", serialNo: a.serialNo,
      student: { name: a.student.name, rollNo: a.student.rollNo, uid: a.student.uid, abcId: a.student.abcId },
      degree: a.student.batch.programme.degreeTitle ?? a.student.batch.programme.name, programme: a.student.batch.programme.name, batch: a.student.batch.name,
      cgpa: s.cgpa, division: s.division, yearOfPassing: s.yearOfPassing,
      convocation: { number: conv.number, title: conv.title, date: conv.date.toISOString() },
      medals: medals.filter((m) => m.winners.some((w) => w.studentId === a.studentId)).map((m) => m.medal.name),
      signatory: { name: vc.name, designation: "Vice-Chancellor" }, issuedOn: new Date().toISOString(),
    };
    await issueDocument({ type: "DEGREE", studentId: a.studentId, refId: a.id, payload, issuedById: actor.id });
  }
  await db.convocation.update({ where: { id: convocationId }, data: { status: "DEGREES_ISSUED", issuedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "DEGREES_CONFERRED", entity: "Convocation", entityId: convocationId, summary: `${conv.title}: ${apps.length} degree certificates digitally signed and issued; ready for DigiLocker / NAD upload` });
  return { ok: true, issued: apps.length };
}

/** Provisional certificate for an eligible graduate awaiting the convocation (signed by the Registrar). */
export async function issueProvisional(studentId: string, actor: Actor) {
  const s = await degreeStatus(studentId);
  if (!s.eligible) return { error: `Not eligible: ${s.checks.filter((c) => !c.ok).map((c) => c.detail).join("; ")}.` };
  const existing = await db.document.findFirst({ where: { studentId, type: "PROVISIONAL", revoked: false } });
  if (existing) return { ok: true, docId: existing.id };
  const registrar = await db.user.findFirst({ where: { role: "REGISTRAR" } });
  const payload: DegreePayload = {
    kind: "PROVISIONAL", serialNo: null,
    student: { name: s.student.name, rollNo: s.student.rollNo, uid: s.student.uid, abcId: s.student.abcId },
    degree: s.student.batch.programme.degreeTitle ?? s.student.batch.programme.name, programme: s.student.batch.programme.name, batch: s.student.batch.name,
    cgpa: s.cgpa, division: s.division, yearOfPassing: s.yearOfPassing, convocation: null, medals: [],
    signatory: { name: registrar?.name ?? "Registrar", designation: "Registrar" }, issuedOn: new Date().toISOString(),
  };
  const doc = await issueDocument({ type: "PROVISIONAL", studentId, payload, issuedById: actor.id });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "PROVISIONAL_ISSUED", entity: "Document", entityId: doc.id, summary: `Provisional certificate ${doc.verifyCode} issued to ${s.student.name} (CGPA ${s.cgpa.toFixed(2)}, ${s.division ?? ""})` });
  return { ok: true, docId: doc.id };
}
