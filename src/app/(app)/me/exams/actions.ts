"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/session";
import { registerStudent } from "@/lib/exams/registration";

export async function submitRegistrationAction(examId: string, paperIds: string[], method: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const paymentRef = `${method}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const res = await registerStudent(user.studentId, examId, paperIds, { id: user.id, role: user.role }, paymentRef);
  revalidatePath("/me/exams");
  return res;
}
