"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { submitEvaluation, type EvaluationMarks } from "@/lib/exams/evaluation";

export async function saveEvaluationAction(evaluationId: string, marks: EvaluationMarks, remarks: string, finalSubmit: boolean) {
  const user = await requireUser(["EVALUATOR", "FACULTY"]);
  const res = await submitEvaluation(evaluationId, marks, remarks, { id: user.id, role: user.role }, finalSubmit);
  revalidatePath(`/evaluation/${evaluationId}`);
  revalidatePath("/evaluation");
  return res;
}
