"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { decideModeration, proposeModeration, statsFor } from "@/lib/results/moderation";

export async function previewModerationAction(paperId: string, delta: number) {
  await requireUser(["COE", "EXAM_STAFF", "VC", "ADMIN"]);
  const { stat, newlyPassing } = await statsFor(paperId, delta);
  return { stat, newlyPassing };
}

export async function proposeModerationAction(examId: string, paperId: string, delta: number, reason: string) {
  const user = await requireUser(["COE"]);
  const res = await proposeModeration(examId, paperId, delta, reason, { id: user.id, role: user.role });
  revalidatePath("/moderation");
  return res;
}

export async function decideModerationAction(actionId: string, approve: boolean, note: string) {
  const user = await requireUser(["VC", "COE"]);
  const res = await decideModeration(actionId, approve, note, { id: user.id, role: user.role });
  revalidatePath("/moderation");
  return res;
}
