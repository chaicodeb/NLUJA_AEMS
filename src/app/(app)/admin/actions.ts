"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { restoreBackup, runBackup, verifyBackup } from "@/lib/admin/backup";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => revalidatePath("/", "layout");

export async function runBackupAction() {
  const user = await requireUser(["ADMIN"]);
  const res = await runBackup("MANUAL", actorOf(user));
  refresh();
  return res;
}

export async function verifyBackupAction(id: string) {
  const user = await requireUser(["ADMIN"]);
  const res = await verifyBackup(id, actorOf(user));
  refresh();
  return res;
}

export async function restoreBackupAction(id: string, confirm: string) {
  const user = await requireUser(["ADMIN"]);
  const res = await restoreBackup(id, confirm, actorOf(user));
  refresh();
  return res;
}
