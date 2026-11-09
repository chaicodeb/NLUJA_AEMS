"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { decideCase, reportCase, scheduleHearing, submitExplanation } from "@/lib/exams/ufm";

const refresh = () => ["/exams", "/me/exams", "/students"].forEach((p) => revalidatePath(p, "layout"));

export async function reportCaseAction(input: Parameters<typeof reportCase>[0]) {
  const user = await requireUser(["EXAM_STAFF", "COE"]);
  const res = await reportCase(input, user);
  refresh();
  return res;
}

export async function scheduleHearingAction(caseId: string, at: string, committee: string) {
  const user = await requireUser(["COE"]);
  const res = await scheduleHearing(caseId, at, committee, user);
  refresh();
  return res;
}

export async function decideCaseAction(caseId: string, penalty: string, note: string) {
  const user = await requireUser(["COE"]);
  const res = await decideCase(caseId, penalty, note, user);
  refresh();
  return res;
}

export async function submitExplanationAction(caseId: string, text: string) {
  const user = await requireUser(["STUDENT"]);
  const res = await submitExplanation(caseId, text, user);
  refresh();
  return res;
}
