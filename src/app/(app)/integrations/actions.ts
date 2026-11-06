"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { retryJob, runDigiLockerQueue, setOutage } from "@/lib/integrations/connectors";
import { createApiKey, revokeApiKey } from "@/lib/integrations/api";
import { commitImport, rollbackImport, stageImport } from "@/lib/integrations/migration";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/integrations", "/dashboard", "/students"].forEach((p) => revalidatePath(p, "layout"));

export async function runQueueAction() {
  const user = await requireUser(["ADMIN", "REGISTRAR", "COE"]);
  const res = await runDigiLockerQueue(actorOf(user));
  refresh();
  return res;
}

export async function retryJobAction(jobId: string) {
  const user = await requireUser(["ADMIN", "REGISTRAR", "COE"]);
  const res = await retryJob(jobId, actorOf(user));
  refresh();
  return res;
}

export async function setOutageAction(code: string, on: boolean) {
  const user = await requireUser(["ADMIN"]);
  const res = await setOutage(code, on, actorOf(user));
  refresh();
  return res;
}

export async function createKeyAction(name: string, scopes: string[]) {
  const user = await requireUser(["ADMIN"]);
  const res = await createApiKey(name, scopes, actorOf(user));
  refresh();
  return res;
}

export async function revokeKeyAction(id: string) {
  const user = await requireUser(["ADMIN"]);
  const res = await revokeApiKey(id, actorOf(user));
  refresh();
  return res;
}

export async function stageImportAction(kind: string, fileName: string, text: string) {
  const user = await requireUser(["ADMIN", "ACADEMIC_STAFF", "REGISTRAR"]);
  const res = await stageImport(kind, fileName, text, actorOf(user));
  refresh();
  return res;
}

export async function commitImportAction(batchId: string) {
  const user = await requireUser(["ADMIN", "ACADEMIC_STAFF", "REGISTRAR"]);
  const res = await commitImport(batchId, actorOf(user));
  refresh();
  return res;
}

export async function rollbackImportAction(batchId: string) {
  const user = await requireUser(["ADMIN", "REGISTRAR"]);
  const res = await rollbackImport(batchId, actorOf(user));
  refresh();
  return res;
}
