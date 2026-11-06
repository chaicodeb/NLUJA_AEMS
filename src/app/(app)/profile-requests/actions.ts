"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { decideChange, requestChange } from "@/lib/students/profile";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/profile-requests", "/me/profile", "/students", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function requestChangeAction(field: string, value: string, reason: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await requestChange(user.studentId, field, value, reason, actorOf(user));
  refresh();
  return res;
}

export async function decideChangeAction(requestId: string, approve: boolean, remark: string) {
  const user = await requireUser(["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"]);
  const res = await decideChange(requestId, approve, remark, actorOf(user));
  refresh();
  return res;
}
