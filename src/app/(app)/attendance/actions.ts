"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { PROCESSES } from "@/lib/workflow/shared";
import { applyLeave, biometricPunches, decideLeave, markSession, sendShortageNotices, type MarkInput } from "@/lib/attendance/daily";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/attendance", "/attendance/classes", "/attendance/leave", "/me/attendance", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function fetchBiometricAction(sessionId: string) {
  await requireUser(["FACULTY", "ACADEMIC_STAFF", "COE"]);
  return biometricPunches(sessionId);
}

export async function markSessionAction(sessionId: string, rows: MarkInput[], source: "FACULTY" | "BIOMETRIC", reason?: string) {
  const user = await requireUser(["FACULTY", "ACADEMIC_STAFF", "COE"]);
  const res = await markSession(sessionId, rows, actorOf(user), source, reason);
  refresh();
  return res;
}

export async function applyLeaveAction(input: { type: string; from: string; to: string; reason: string; document?: string }) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await applyLeave(user.studentId, input, actorOf(user));
  refresh();
  return res;
}

export async function decideLeaveAction(leaveId: string, approve: boolean, note: string) {
  const user = await requireUser(PROCESSES.LEAVE.roles);
  const res = await decideLeave(leaveId, approve, note, actorOf(user));
  refresh();
  return res;
}

export async function sendNoticesAction(batchId: string) {
  const user = await requireUser(["HOD", "ACADEMIC_STAFF", "COE", "ADMIN"]);
  const res = await sendShortageNotices(batchId, actorOf(user));
  refresh();
  return res;
}
