"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { postToMarks, saveMemorial, saveScoreSheet, scheduleRound } from "@/lib/moot/moot";

const ROLES = ["FACULTY", "HOD", "ACADEMIC_STAFF", "COE", "ADMIN"] as const;
const refresh = () => revalidatePath("/moot", "layout");

export async function scheduleRoundAction(competitionId: string, input: Parameters<typeof scheduleRound>[1]) {
  const user = await requireUser([...ROLES]);
  const res = await scheduleRound(competitionId, input, user);
  refresh();
  return res;
}

export async function saveMemorialAction(teamId: string, detail: Record<string, number>, evaluator: string) {
  const user = await requireUser([...ROLES]);
  const res = await saveMemorial(teamId, detail, evaluator, user);
  refresh();
  return res;
}

export async function saveScoreSheetAction(roundId: string, judge: string, sheet: Record<string, Record<string, number>>) {
  const user = await requireUser([...ROLES]);
  const res = await saveScoreSheet(roundId, judge, sheet, user);
  refresh();
  return res;
}

export async function postToMarksAction(competitionId: string) {
  const user = await requireUser([...ROLES]);
  const res = await postToMarks(competitionId, user);
  refresh();
  revalidatePath("/marks", "layout");
  return res;
}
