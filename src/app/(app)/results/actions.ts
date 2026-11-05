"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { processResults } from "@/lib/results/engine";
import { approveRun, publishRun } from "@/lib/results/workflow";

export async function processResultsAction(examId: string) {
  const user = await requireUser(["ADMIN", "COE", "EXAM_STAFF"]);
  const res = await processResults(examId, { id: user.id, role: user.role });
  revalidatePath("/results");
  return res;
}

export async function approveRunAction(runId: string) {
  const user = await requireUser(["COE"]);
  const res = await approveRun(runId, { id: user.id, role: user.role });
  revalidatePath(`/results/${runId}`);
  return res;
}

export async function publishRunAction(runId: string) {
  const user = await requireUser(["VC"]);
  const res = await publishRun(runId, { id: user.id, role: user.role });
  revalidatePath(`/results/${runId}`);
  revalidatePath("/me/results");
  return res;
}
