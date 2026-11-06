import { db } from "../db";
import { audit } from "../audit";
import { CATEGORY_LABELS } from "../admissions/shared";

type Actor = { id: string; role: string };

/** Contact details are the student's own to change; identity fields appear on certificates and need the Academic Section's approval. */
export const PROFILE_FIELDS: Record<string, { label: string; approval: boolean; kind?: "date" | "category" | "email" | "phone" }> = {
  phone: { label: "Mobile number", approval: false, kind: "phone" },
  parentPhone: { label: "Parent / guardian mobile", approval: false, kind: "phone" },
  parentEmail: { label: "Parent / guardian e-mail", approval: false, kind: "email" },
  name: { label: "Name (as in Class X certificate)", approval: true },
  dob: { label: "Date of birth", approval: true, kind: "date" },
  parentName: { label: "Father's / guardian's name", approval: true },
  category: { label: "Social category", approval: true, kind: "category" },
};

const show = (field: string, v: unknown) =>
  v == null || v === "" ? "—" : field === "dob" ? new Date(v as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : field === "category" ? CATEGORY_LABELS[v as string] ?? String(v) : String(v);

function validate(field: string, value: string) {
  const kind = PROFILE_FIELDS[field]?.kind;
  if (!value.trim()) return "Enter the new value.";
  if (kind === "phone" && !/^[6-9]\d{9}$/.test(value.trim())) return "Enter a 10-digit Indian mobile number.";
  if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Enter a valid e-mail address.";
  if (kind === "date" && Number.isNaN(Date.parse(value))) return "Enter a valid date.";
  if (kind === "category" && !CATEGORY_LABELS[value]) return "Choose a category.";
  if (!kind && value.trim().length < 3) return "The value is too short.";
  return null;
}

export async function requestChange(studentId: string, field: string, value: string, reason: string, actor: Actor) {
  const spec = PROFILE_FIELDS[field];
  if (!spec) return { error: "This field cannot be changed online." };
  const error = validate(field, value);
  if (error) return { error };
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const current = (student as Record<string, unknown>)[field];
  const next = field === "dob" ? new Date(value) : value.trim();
  if (show(field, current) === show(field, next)) return { error: "That is already the value on record." };

  if (!spec.approval) {
    await db.student.update({ where: { id: studentId }, data: { [field]: next } });
    await audit({ actorId: actor.id, actorRole: actor.role, action: "PROFILE_UPDATED", entity: "Student", entityId: studentId, summary: `${student.name} changed ${spec.label.toLowerCase()} from ${show(field, current)} to ${show(field, next)}` });
    return { ok: true, applied: true };
  }
  if (reason.trim().length < 10) return { error: "Explain the correction and the document that supports it." };
  if (await db.profileChangeRequest.findFirst({ where: { studentId, field, status: "PENDING" } })) return { error: "A request for this field is already pending." };
  const req = await db.profileChangeRequest.create({
    data: { studentId, field, oldValue: current == null ? null : field === "dob" ? (current as Date).toISOString() : String(current), newValue: field === "dob" ? (next as Date).toISOString() : (next as string), reason: reason.trim() },
  });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "PROFILE_CHANGE_REQUESTED", entity: "ProfileChangeRequest", entityId: req.id, summary: `${student.name} asked to change ${spec.label.toLowerCase()} from ${show(field, current)} to ${show(field, next)}` });
  return { ok: true, applied: false };
}

export async function decideChange(requestId: string, approve: boolean, remark: string, actor: Actor) {
  const req = await db.profileChangeRequest.findUnique({ where: { id: requestId }, include: { student: { include: { user: true } } } });
  if (!req || req.status !== "PENDING") return { error: "This request has already been decided." };
  if (!approve && remark.trim().length < 5) return { error: "Give the student a reason." };
  const spec = PROFILE_FIELDS[req.field];
  const value = req.field === "dob" ? new Date(req.newValue) : req.newValue;
  await db.$transaction([
    db.profileChangeRequest.update({ where: { id: req.id }, data: { status: approve ? "APPROVED" : "REJECTED", remark: remark.trim() || null, decidedById: actor.id, decidedAt: new Date() } }),
    ...(approve ? [db.student.update({ where: { id: req.studentId }, data: { [req.field]: value } })] : []),
    ...(approve && req.field === "name" && req.student.user ? [db.user.update({ where: { id: req.student.user.id }, data: { name: req.newValue } })] : []),
  ]);
  await audit({
    actorId: actor.id, actorRole: actor.role, action: approve ? "PROFILE_CHANGE_APPROVED" : "PROFILE_CHANGE_REJECTED", entity: "Student", entityId: req.studentId,
    summary: `${req.student.name}: ${spec.label.toLowerCase()} ${show(req.field, req.oldValue)} → ${show(req.field, value)} ${approve ? "approved; record updated (documents issued from now on carry the new value)" : `rejected — ${remark.trim()}`}`,
  });
  return { ok: true };
}

export function displayValue(field: string, v: string | null) {
  return show(field, v);
}
