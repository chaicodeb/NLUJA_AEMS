"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import type { QPContent } from "@/lib/exams/question-paper-checks";
import { moderatePaper, releasePaper, saveDraft, sealPaper, startPaper, submitPaper } from "@/lib/exams/question-paper";

const ROLES = ["FACULTY", "HOD", "COE", "EXAM_STAFF"] as const;

function done<T>(id: string, res: T) {
  revalidatePath("/question-papers");
  revalidatePath(`/question-papers/${id}`);
  return res;
}

export async function startPaperAction(id: string) {
  const user = await requireUser([...ROLES]);
  return done(id, await startPaper(id, user));
}

export async function saveDraftAction(id: string, content: QPContent, submit: boolean) {
  const user = await requireUser([...ROLES]);
  const saved = await saveDraft(id, content, user);
  if ("error" in saved || !submit) return done(id, saved);
  return done(id, await submitPaper(id, user));
}

export async function moderateAction(id: string, decision: "APPROVED" | "CHANGES_REQUESTED", note: string) {
  const user = await requireUser([...ROLES]);
  return done(id, await moderatePaper(id, decision, note, user));
}

export async function sealAction(id: string) {
  const user = await requireUser([...ROLES]);
  return done(id, await sealPaper(id, user));
}

export async function releaseAction(id: string) {
  const user = await requireUser([...ROLES]);
  return done(id, await releasePaper(id, user));
}
