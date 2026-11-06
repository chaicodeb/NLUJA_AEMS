"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { publishMerit, rejectApplication, respondToOffer, reviewDocument, saveMarks } from "@/lib/admissions/admissions";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/admissions", "/application", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));
const VERIFIERS = ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"] as const;

export async function reviewDocumentAction(docId: string, decision: "ACCEPT" | "REJECT", remark: string) {
  const user = await requireUser([...VERIFIERS]);
  const res = await reviewDocument(docId, decision, remark, actorOf(user));
  refresh();
  return res;
}

export async function rejectApplicationAction(applicationId: string, reason: string) {
  const user = await requireUser([...VERIFIERS]);
  const res = await rejectApplication(applicationId, reason, actorOf(user));
  refresh();
  return res;
}

export async function saveMarksAction(cycleId: string, entries: { applicationId: string; code: string; value: number | null }[]) {
  const user = await requireUser(["HOD", "ACADEMIC_STAFF", "REGISTRAR", "ADMIN"]);
  const res = await saveMarks(cycleId, entries, actorOf(user));
  refresh();
  return res;
}

export async function publishMeritAction(cycleId: string) {
  const user = await requireUser(["REGISTRAR", "ADMIN"]);
  const res = await publishMerit(cycleId, actorOf(user));
  refresh();
  return res;
}

export async function respondToOfferAction(accept: boolean) {
  const user = await requireUser(["APPLICANT"]);
  const app = await db.application.findUnique({ where: { userId: user.id } });
  if (!app) return { error: "No application found." };
  const res = await respondToOffer(app.id, accept, actorOf(user));
  refresh();
  return res;
}
