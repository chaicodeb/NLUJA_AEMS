"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { importSheet, remindTeacher, reopenSheet, returnSheet, saveSheetDraft, submitSheet, verifySheet } from "@/lib/marks/internal";
import type { RowInput } from "@/lib/marks/shared";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = (id: string) => {
  revalidatePath("/marks");
  revalidatePath(`/marks/${id}`);
};

export async function saveDraftAction(sheetId: string, rows: RowInput[]) {
  const user = await requireUser(["FACULTY"]);
  const res = await saveSheetDraft(sheetId, rows, actorOf(user));
  refresh(sheetId);
  return res;
}

export async function submitSheetAction(sheetId: string, rows: RowInput[]) {
  const user = await requireUser(["FACULTY"]);
  const saved = await saveSheetDraft(sheetId, rows, actorOf(user));
  if ("error" in saved) return saved;
  const res = await submitSheet(sheetId, actorOf(user));
  refresh(sheetId);
  return res;
}

export async function importSheetAction(sheetId: string, form: FormData) {
  const user = await requireUser(["FACULTY"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose an Excel file to import." };
  if (file.size > 2_000_000) return { error: "The file is larger than 2 MB." };
  const res = await importSheet(sheetId, await file.arrayBuffer(), actorOf(user));
  refresh(sheetId);
  return res;
}

export async function verifySheetAction(sheetId: string) {
  const user = await requireUser(["HOD", "COE"]);
  const res = await verifySheet(sheetId, actorOf(user));
  refresh(sheetId);
  return res;
}

export async function returnSheetAction(sheetId: string, note: string) {
  const user = await requireUser(["HOD", "COE"]);
  const res = await returnSheet(sheetId, note, actorOf(user));
  refresh(sheetId);
  return res;
}

export async function reopenSheetAction(sheetId: string, reason: string) {
  const user = await requireUser(["COE"]);
  const res = await reopenSheet(sheetId, reason, actorOf(user));
  refresh(sheetId);
  return res;
}

export async function remindTeacherAction(sheetId: string) {
  const user = await requireUser(["HOD", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "ADMIN"]);
  return remindTeacher(sheetId, actorOf(user));
}
