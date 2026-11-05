"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { decideClearance, issueExitCertificates, processRefund, saveBankDetails, startExit } from "@/lib/exit/exit";
import { saveMyProfile } from "@/lib/alumni/alumni";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/exit", "/clearance", "/me/exit", "/me/degree", "/convocation", "/alumni", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function startExitAction(type: string, reason: string, forwardingAddress: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await startExit(user.studentId, type, reason, forwardingAddress, actorOf(user));
  refresh();
  return res;
}

export async function bankDetailsAction(account: string, ifsc: string) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await saveBankDetails(user.studentId, account, ifsc, actorOf(user));
  refresh();
  return res;
}

export async function decideClearanceAction(studentId: string, department: string, decision: "CLEAR" | "DUES" | "DEDUCT", amount: number, note: string) {
  const user = await requireUser(["LIBRARIAN", "WARDEN", "ACCOUNTS", "EXAM_STAFF", "REGISTRAR", "ADMIN"]);
  const res = await decideClearance(studentId, department, decision, amount, note, actorOf(user));
  refresh();
  return res;
}

export async function refundAction(studentId: string) {
  const user = await requireUser(["ACCOUNTS", "ADMIN"]);
  const res = await processRefund(studentId, actorOf(user));
  refresh();
  return res;
}

export async function issueCertificatesAction(studentId: string) {
  const user = await requireUser(["REGISTRAR", "ADMIN"]);
  const res = await issueExitCertificates(studentId, actorOf(user));
  refresh();
  return res;
}

export async function saveAlumniAction(input: { sector: string; organisation: string; designation: string; city: string; phone: string; qualifiedExams: string[]; directoryConsent: boolean; mentor: boolean }) {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) return { error: "No student record is linked to this account." };
  const res = await saveMyProfile(user.studentId, input, actorOf(user));
  refresh();
  return res;
}
