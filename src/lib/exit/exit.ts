import { randomBytes } from "node:crypto";
import { db } from "../db";
import { audit } from "../audit";
import { issueDocument } from "../docs";
import { DEPARTMENTS } from "../convocation/degree";

type Actor = { id: string; role: string };
export const DEPARTMENT_ROLE: Record<string, string> = { LIBRARY: "LIBRARIAN", HOSTEL: "WARDEN", ACCOUNTS: "ACCOUNTS", EXAMINATION: "EXAM_STAFF" };
export const EXIT_TYPES: Record<string, string> = { GRADUATION: "Graduation", WITHDRAWAL: "Withdrawal", TRANSFER: "Transfer / migration" };

export type ExitCertificatePayload = {
  kind: "MIGRATION" | "CHARACTER";
  serialNo: string;
  student: { name: string; rollNo: string; uid: string; parentName: string | null; gender?: string };
  programme: string;
  batch: string;
  period: string;
  lastExamination: string;
  exitType: string;
  conduct: string;
  signatory: { name: string; designation: string };
  issuedOn: string;
};

export function departmentsFor(role: string) {
  if (["REGISTRAR", "ADMIN"].includes(role)) return Object.keys(DEPARTMENTS);
  return Object.entries(DEPARTMENT_ROLE).filter(([, r]) => r === role).map(([d]) => d);
}

export async function exitStatus(studentId: string) {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: { include: { programme: true } }, exitRequest: true, clearances: true, alumniProfile: true } });
  const exitForm = await db.feedbackForm.findFirst({ where: { type: "EXIT", status: { in: ["OPEN", "CLOSED"] } }, orderBy: { opensAt: "desc" } });
  const surveyDone = exitForm ? !!(await db.feedbackSubmission.findUnique({ where: { formId_studentId_courseId: { formId: exitForm.id, studentId, courseId: "" } } })) : true;
  const certificates = await db.document.findMany({ where: { studentId, type: { in: ["MIGRATION", "CHARACTER"] }, revoked: false } });
  const clearances = Object.keys(DEPARTMENTS).map((d) => ({ department: d, row: student.clearances.find((c) => c.department === d) ?? null }));
  const cleared = clearances.every((c) => c.row?.status === "CLEARED");
  const req = student.exitRequest;
  return {
    student, request: req, clearances, cleared, surveyDone, exitFormId: exitForm?.id ?? null, certificates,
    refund: req ? { deposit: req.cautionDeposit, deductions: req.deductions, net: Math.max(0, req.cautionDeposit - req.deductions), paid: !!req.refundedAt } : null,
    graduating: student.batch.currentSemester >= student.batch.programme.durationSemesters,
  };
}

export async function startExit(studentId: string, type: string, reason: string, forwardingAddress: string, actor: Actor) {
  if (!EXIT_TYPES[type]) return { error: "Choose the type of exit." };
  if (await db.exitRequest.findUnique({ where: { studentId } })) return { error: "An exit request already exists." };
  if (type !== "GRADUATION" && reason.trim().length < 10) return { error: "State the reason for leaving." };
  const req = await db.exitRequest.create({ data: { studentId, type, reason: reason.trim() || null, forwardingAddress: forwardingAddress.trim() || null } });
  for (const d of Object.keys(DEPARTMENTS)) {
    await db.clearance.upsert({ where: { studentId_department: { studentId, department: d } }, create: { studentId, department: d, status: "PENDING" }, update: {} });
  }
  const s = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "EXIT_INITIATED", entity: "ExitRequest", entityId: req.id, summary: `${s.name} (${s.rollNo}): ${EXIT_TYPES[type].toLowerCase()} initiated; no-dues requests sent to the Library, Hostel, Accounts and Examination Branch` });
  return { ok: true };
}

export async function exitRegister() {
  const requests = await db.exitRequest.findMany({ include: { student: { include: { batch: true, clearances: true } } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }] });
  const exitForm = await db.feedbackForm.findFirst({ where: { type: "EXIT", status: { in: ["OPEN", "CLOSED"] } }, orderBy: { opensAt: "desc" } });
  const ids = requests.map((r) => r.studentId);
  const [surveyed, docs] = await Promise.all([
    exitForm ? db.feedbackSubmission.findMany({ where: { formId: exitForm.id, studentId: { in: ids } }, select: { studentId: true } }) : [],
    db.document.findMany({ where: { studentId: { in: ids }, type: { in: ["MIGRATION", "CHARACTER"] }, revoked: false }, orderBy: { type: "asc" } }),
  ]);
  const done = new Set(surveyed.map((s) => s.studentId));
  return requests.map((r) => {
    const cleared = Object.keys(DEPARTMENTS).filter((d) => r.student.clearances.find((c) => c.department === d)?.status === "CLEARED");
    return {
      ...r, cleared: cleared.length, allCleared: cleared.length === Object.keys(DEPARTMENTS).length,
      blockers: r.student.clearances.filter((c) => c.status !== "CLEARED").map((c) => `${DEPARTMENTS[c.department]}${c.status === "DUES" ? ` (₹${c.amount} due)` : ""}`),
      surveyDone: r.type !== "GRADUATION" || !exitForm || done.has(r.studentId),
      net: Math.max(0, r.cautionDeposit - r.deductions), certificates: docs.filter((d) => d.studentId === r.studentId),
    };
  });
}

/** Pending and disputed clearances for a department, oldest exit request first. */
export async function deskQueue(departments: string[]) {
  const rows = await db.clearance.findMany({
    where: { department: { in: departments } },
    include: { student: { include: { batch: true, exitRequest: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return rows.filter((r) => r.student.exitRequest || r.status !== "CLEARED");
}

export async function decideClearance(studentId: string, department: string, decision: "CLEAR" | "DUES" | "DEDUCT", amount: number, note: string, actor: Actor) {
  if (!departmentsFor(actor.role).includes(department)) return { error: `Only the ${DEPARTMENTS[department]} desk can decide this clearance.` };
  const row = await db.clearance.findUnique({ where: { studentId_department: { studentId, department } }, include: { student: { include: { exitRequest: true } } } });
  if (!row) return { error: "No clearance request found." };
  if (decision !== "CLEAR" && !(amount > 0)) return { error: "Enter the amount due." };
  if (decision !== "CLEAR" && note.trim().length < 5) return { error: "Describe what the dues are for." };
  if (decision === "DEDUCT" && !row.student.exitRequest) return { error: "Recovery from the caution deposit is possible only at exit." };
  if (decision === "CLEAR") {
    await db.clearance.update({ where: { id: row.id }, data: { status: "CLEARED", note: note.trim() || (row.status === "DUES" ? `Dues of ₹${row.amount} settled` : "No dues"), updatedById: actor.id } });
  } else if (decision === "DUES") {
    await db.clearance.update({ where: { id: row.id }, data: { status: "DUES", amount: Math.round(amount), note: note.trim(), updatedById: actor.id } });
  } else {
    await db.$transaction([
      db.clearance.update({ where: { id: row.id }, data: { status: "CLEARED", amount: Math.round(amount), note: `₹${Math.round(amount)} recovered from caution deposit — ${note.trim()}`, updatedById: actor.id } }),
      db.exitRequest.update({ where: { studentId }, data: { deductions: { increment: Math.round(amount) } } }),
    ]);
  }
  await audit({
    actorId: actor.id, actorRole: actor.role, action: decision === "DUES" ? "DUES_RECORDED" : "DUES_CLEARED", entity: "Student", entityId: studentId,
    summary: `${row.student.name}: ${DEPARTMENTS[department]} — ${decision === "CLEAR" ? "no dues, cleared" : decision === "DUES" ? `dues of ₹${Math.round(amount)} recorded (${note.trim()})` : `₹${Math.round(amount)} recovered from caution deposit (${note.trim()})`}`,
  });
  return { ok: true };
}

export async function saveBankDetails(studentId: string, account: string, ifsc: string, actor: Actor) {
  if (!/^\d{9,18}$/.test(account.trim())) return { error: "Enter a valid bank account number (9–18 digits)." };
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase())) return { error: "Enter a valid IFSC (e.g. SBIN0001234)." };
  const req = await db.exitRequest.findUnique({ where: { studentId } });
  if (!req) return { error: "Start the exit process first." };
  if (req.refundedAt) return { error: "The refund has already been paid." };
  await db.exitRequest.update({ where: { studentId }, data: { bankAccount: account.trim(), ifsc: ifsc.trim().toUpperCase() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "REFUND_DETAILS_SUBMITTED", entity: "ExitRequest", entityId: req.id, summary: `Caution-deposit refund account submitted (A/c ••••${account.trim().slice(-4)}, ${ifsc.trim().toUpperCase()})` });
  return { ok: true };
}

export async function processRefund(studentId: string, actor: Actor) {
  if (!["ACCOUNTS", "ADMIN"].includes(actor.role)) return { error: "Refunds are released by Finance & Accounts." };
  const s = await exitStatus(studentId);
  if (!s.request) return { error: "No exit request." };
  if (!s.cleared) return { error: "All departments must clear the student first." };
  if (!s.request.bankAccount) return { error: "The student has not submitted bank details." };
  if (s.request.refundedAt) return { error: "Already refunded." };
  const net = s.refund!.net;
  const ref = `NEFT${randomBytes(5).toString("hex").toUpperCase()}`;
  await db.exitRequest.update({ where: { studentId }, data: { refundRef: ref, refundedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "REFUND_PAID", entity: "ExitRequest", entityId: s.request.id, summary: `${s.student.name}: caution deposit ₹${s.refund!.deposit} − deductions ₹${s.refund!.deductions} = ₹${net} refunded by NEFT ${ref} to A/c ••••${s.request.bankAccount.slice(-4)}` });
  return { ok: true, net, ref };
}

/** Registrar issues the migration and character certificates once every department has cleared the student. */
export async function issueExitCertificates(studentId: string, actor: Actor) {
  if (!["REGISTRAR", "ADMIN"].includes(actor.role)) return { error: "Certificates are issued by the Registrar." };
  const s = await exitStatus(studentId);
  if (!s.request) return { error: "No exit request." };
  if (!s.cleared) return { error: "No-dues clearance is incomplete." };
  if (s.request.type === "GRADUATION" && !s.surveyDone) return { error: "The graduate exit survey is pending." };
  if (s.certificates.length) return { error: "Certificates have already been issued." };
  const registrar = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const year = new Date().getFullYear();
  const count = await db.document.count({ where: { type: "MIGRATION" } });
  const lastSem = (await db.semesterResult.findFirst({ where: { studentId, run: { status: "PUBLISHED" } }, orderBy: { semester: "desc" } }))?.semester ?? s.student.batch.currentSemester;
  const base = {
    student: { name: s.student.name, rollNo: s.student.rollNo, uid: s.student.uid, parentName: s.student.parentName, gender: s.student.gender },
    programme: s.student.batch.programme.name, batch: s.student.batch.name,
    period: `${s.student.batch.admissionYear} – ${s.request.type === "GRADUATION" ? s.student.batch.admissionYear + Math.ceil(s.student.batch.programme.durationSemesters / 2) : year}`,
    lastExamination: `${s.student.batch.programme.name}, Semester ${lastSem}`,
    exitType: EXIT_TYPES[s.request.type], conduct: "good", signatory: { name: registrar.name, designation: "Registrar" }, issuedOn: new Date().toISOString(),
  };
  const mig: ExitCertificatePayload = { ...base, kind: "MIGRATION", serialNo: `MC/${year}/${String(count + 1).padStart(4, "0")}` };
  const chr: ExitCertificatePayload = { ...base, kind: "CHARACTER", serialNo: `CC/${year}/${String(count + 1).padStart(4, "0")}` };
  await issueDocument({ type: "MIGRATION", studentId, payload: mig, issuedById: actor.id });
  await issueDocument({ type: "CHARACTER", studentId, payload: chr, issuedById: actor.id });
  await db.exitRequest.update({ where: { studentId }, data: { status: "COMPLETED", completedAt: new Date() } });
  if (s.request.type !== "GRADUATION") await db.student.update({ where: { id: studentId }, data: { status: "WITHDRAWN" } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "EXIT_COMPLETED", entity: "ExitRequest", entityId: s.request.id, summary: `${s.student.name}: migration certificate ${mig.serialNo} and character certificate issued; exit completed${s.request.type !== "GRADUATION" ? " and the student record closed as withdrawn" : ""}` });
  return { ok: true };
}
