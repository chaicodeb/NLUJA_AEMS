"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { issueTranscript } from "@/lib/results/transcript";

export async function requestStudentCopyAction() {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await issueTranscript(user.studentId, "STUDENT_COPY", null, { id: user.id, role: user.role });
  revalidatePath("/me/results");
  return res;
}

export async function issueOfficialTranscriptAction(studentId: string, purpose: string) {
  const user = await requireUser(["COE", "REGISTRAR", "ADMIN"]);
  if (!purpose.trim()) return { error: "State the purpose / addressee (e.g. 'Higher studies — University of Delhi')." };
  const res = await issueTranscript(studentId, "OFFICIAL", purpose.trim(), { id: user.id, role: user.role });
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/me/results");
  return res;
}
