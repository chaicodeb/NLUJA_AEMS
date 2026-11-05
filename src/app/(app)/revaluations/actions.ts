"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { applyRevaluation, assignRevaluator, decideRevaluation } from "@/lib/results/revaluation";

export async function applyRevaluationAction(scriptId: string, type: "REVALUATION" | "SCRUTINY", reason: string, method: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await applyRevaluation(user.studentId, scriptId, type, reason, method, { id: user.id, role: user.role });
  revalidatePath("/me/results");
  revalidatePath("/revaluations");
  return res;
}

export async function assignRevaluatorAction(requestId: string, evaluatorId: string) {
  const user = await requireUser(["COE", "EXAM_STAFF", "ADMIN"]);
  const res = await assignRevaluator(requestId, evaluatorId, { id: user.id, role: user.role });
  revalidatePath("/revaluations");
  return res;
}

export async function decideRevaluationAction(requestId: string) {
  const user = await requireUser(["COE"]);
  const res = await decideRevaluation(requestId, { id: user.id, role: user.role });
  revalidatePath("/revaluations");
  revalidatePath("/me/results");
  return res;
}
