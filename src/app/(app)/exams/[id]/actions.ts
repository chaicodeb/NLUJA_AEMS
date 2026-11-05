"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { computeEligibility } from "@/lib/exams/eligibility";
import { bulkRegisterEligible } from "@/lib/exams/registration";
import { generateSeating } from "@/lib/exams/seating";
import { publishAdmitCards } from "@/lib/exams/admit-cards";

const EXAM_OPS = ["ADMIN", "COE", "EXAM_STAFF"] as const;

export async function bulkRegisterAction(examId: string) {
  const user = await requireUser([...EXAM_OPS]);
  const res = await bulkRegisterEligible(examId, { id: user.id, role: user.role });
  revalidatePath(`/exams/${examId}`);
  return res;
}

export async function generateSeatingAction(examId: string) {
  const user = await requireUser([...EXAM_OPS]);
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId } });
  if (exam.admitCardsPublished) return { error: "Admit cards are already published. Withdraw them before re-generating seating." };
  const res = await generateSeating(examId, { id: user.id, role: user.role });
  revalidatePath(`/exams/${examId}`);
  return res;
}

export async function publishAdmitCardsAction(examId: string) {
  const user = await requireUser(["ADMIN", "COE"]);
  const res = await publishAdmitCards(examId, { id: user.id, role: user.role });
  revalidatePath(`/exams/${examId}`);
  revalidatePath("/me/exams");
  return res;
}

export async function runEligibilityAction(examId: string) {
  const user = await requireUser(["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF"]);
  const summary = await computeEligibility(examId, { id: user.id, role: user.role });
  revalidatePath(`/exams/${examId}`);
  return summary;
}

export async function fileRelaxationAction(examId: string, enrolmentId: string, ground: string, remarks: string) {
  const user = await requireUser(["ADMIN", "COE", "ACADEMIC_STAFF"]);
  const elig = await db.eligibility.findUniqueOrThrow({ where: { examId_enrolmentId: { examId, enrolmentId } }, include: { enrolment: { include: { student: true, course: true } } } });
  if (!elig.relaxable) return { error: "This student does not meet the conditions for relaxation under the active rule." };
  const existing = await db.relaxationRequest.findFirst({ where: { examId, enrolmentId, status: "PENDING" } });
  if (existing) return { error: "A request is already pending for this course." };
  const req = await db.relaxationRequest.create({
    data: { examId, enrolmentId, studentId: elig.enrolment.studentId, ground, remarks, requestedById: user.id },
  });
  await audit({
    actorId: user.id, actorRole: user.role, action: "RELAXATION_REQUESTED", entity: "RelaxationRequest", entityId: req.id,
    summary: `Attendance relaxation requested for ${elig.enrolment.student.name} in ${elig.enrolment.course.code} (${elig.coursePct.toFixed(2)}%) on ${ground.toLowerCase()} grounds`,
    after: { ground, remarks, coursePct: elig.coursePct, aggregatePct: elig.aggregatePct },
  });
  await computeEligibility(examId, undefined, [enrolmentId]);
  revalidatePath(`/exams/${examId}`);
  revalidatePath("/relaxations");
  return { ok: true };
}
