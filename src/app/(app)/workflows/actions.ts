"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { saveDefinition } from "@/lib/workflow/engine";
import { PROCESSES, type ProcessKey, type Step } from "@/lib/workflow/shared";

export async function saveWorkflowAction(process: string, steps: Step[], note: string) {
  const user = await requireUser(["ADMIN", "COE", "ACADEMIC_STAFF", "VC", "REGISTRAR"]);
  if (!(process in PROCESSES)) return { error: "Unknown workflow." };
  const res = await saveDefinition(process as ProcessKey, steps, note, user);
  revalidatePath("/workflows", "layout");
  revalidatePath(PROCESSES[process as ProcessKey].screen);
  return res;
}
