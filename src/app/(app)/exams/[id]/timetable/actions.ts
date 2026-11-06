"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { planExam, proposeTimetable, publishTimetable, saveTimetable } from "@/lib/exams/timetable";
import type { Session } from "@/lib/exams/timetable-shared";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/exams", "/calendar", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function proposeTimetableAction(examId: string, window: { from: string; to: string; gap: number }) {
  await requireUser(["COE", "EXAM_STAFF", "ADMIN"]);
  return proposeTimetable(examId, window);
}

export async function saveTimetableAction(examId: string, entries: { courseId: string; date: string | null; session: Session | null }[], window: { from: string; to: string; gap: number }) {
  const user = await requireUser(["COE", "EXAM_STAFF", "ADMIN"]);
  const res = await saveTimetable(examId, entries, window, actorOf(user));
  refresh();
  return res;
}

export async function publishTimetableAction(examId: string) {
  const user = await requireUser(["COE", "ADMIN"]);
  const res = await publishTimetable(examId, actorOf(user));
  refresh();
  return res;
}

export async function planExamAction(input: { code: string; name: string; parity: string; academicYear: string; from: string; to: string; fee: number }) {
  const user = await requireUser(["COE", "ADMIN"]);
  const res = await planExam(input, actorOf(user));
  refresh();
  return res;
}
