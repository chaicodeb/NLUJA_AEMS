"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { addAction, createForm, setFormStatus, submitFeedback, updateQuestions } from "@/lib/feedback/feedback";
import type { Answers, Question } from "@/lib/feedback/shared";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/feedback", "/me/feedback", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function submitFeedbackAction(formId: string, courseId: string, answers: Answers) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await submitFeedback(user.studentId, formId, courseId, answers, actorOf(user));
  refresh();
  return res;
}

export async function setFormStatusAction(formId: string, change: "OPEN" | "CLOSED" | "RELEASE") {
  const user = await requireUser(["IQAC", "ADMIN"]);
  const res = await setFormStatus(formId, change, actorOf(user));
  refresh();
  return res;
}

export async function createFormAction(type: "COURSE" | "INSTITUTION", title: string, academicYear: string, opensOn: string, closesOn: string) {
  const user = await requireUser(["IQAC", "ADMIN"]);
  const res = await createForm(type, title, academicYear, new Date(`${opensOn}T09:00:00+05:30`), new Date(`${closesOn}T23:59:59+05:30`), actorOf(user));
  refresh();
  return res;
}

export async function updateQuestionsAction(formId: string, questions: Question[]) {
  const user = await requireUser(["IQAC", "ADMIN"]);
  const res = await updateQuestions(formId, questions, actorOf(user));
  refresh();
  return res;
}

export async function addActionTakenAction(formId: string, courseId: string, note: string) {
  const user = await requireUser(["IQAC", "HOD", "ADMIN"]);
  const res = await addAction(formId, courseId, note, actorOf(user));
  refresh();
  return res;
}
