"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { applyForDegree, clearDues, conferDegrees, freezeList, issueProvisional } from "@/lib/convocation/degree";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/convocation", "/me/degree"].forEach((p) => revalidatePath(p, "layout"));

export async function applyForDegreeAction(mode: string, guests: number, method: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await applyForDegree(user.studentId, mode, guests, method, actorOf(user));
  refresh();
  return res;
}

export async function provisionalAction() {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await issueProvisional(user.studentId, actorOf(user));
  refresh();
  return res;
}

export async function clearDuesAction(studentId: string, department: string, receipt: string) {
  const user = await requireUser(["REGISTRAR", "ADMIN"]);
  const res = await clearDues(studentId, department, receipt, actorOf(user));
  refresh();
  return res;
}

export async function freezeListAction(convocationId: string, resolution: string) {
  const user = await requireUser(["REGISTRAR", "ADMIN"]);
  const res = await freezeList(convocationId, resolution, actorOf(user));
  refresh();
  return res;
}

export async function conferDegreesAction(convocationId: string) {
  const user = await requireUser(["VC"]);
  const res = await conferDegrees(convocationId, actorOf(user));
  refresh();
  return res;
}
