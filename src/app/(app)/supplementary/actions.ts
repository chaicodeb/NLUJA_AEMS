"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createSupplementaryExam, processSupplementary, registerSupplementary, saveAwardList } from "@/lib/results/supplementary";

const refresh = () => ["/supplementary", "/me/exams", "/exams", "/results"].forEach((p) => revalidatePath(p, "layout"));

export async function createSupplementaryAction() {
  const user = await requireUser(["COE"]);
  const res = await createSupplementaryExam({ id: user.id, role: user.role });
  refresh();
  return res;
}

export async function registerSupplementaryAction(examId: string, paperIds: string[], method: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await registerSupplementary(user.studentId, examId, paperIds, method, { id: user.id, role: user.role });
  refresh();
  return res;
}

export async function saveAwardListAction(paperId: string, entries: { registrationPaperId: string; marks: number | null; absent: boolean }[], submit: boolean) {
  const user = await requireUser(["EXAM_STAFF", "COE"]);
  const res = await saveAwardList(paperId, entries, submit, { id: user.id, role: user.role });
  refresh();
  return res;
}

export async function processSupplementaryAction(examId: string) {
  const user = await requireUser(["EXAM_STAFF", "COE", "ADMIN"]);
  const res = await processSupplementary(examId, { id: user.id, role: user.role });
  refresh();
  return res;
}
