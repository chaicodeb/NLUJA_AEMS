"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { computeEligibility } from "@/lib/exams/eligibility";
import { getActiveRule } from "@/lib/rules/store";
import { asParams, type AttendanceParams } from "@/lib/rules/engine";

export async function decideRelaxationAction(id: string, decision: "APPROVED" | "REJECTED", note: string) {
  const user = await requireUser();
  const req = await db.relaxationRequest.findUniqueOrThrow({
    where: { id },
    include: { student: { include: { batch: true } }, enrolment: { include: { course: true } } },
  });
  if (req.status !== "PENDING") return { error: "This request has already been decided." };
  const rule = await getActiveRule("ATTENDANCE", req.student.batch.programmeId);
  const authority = rule ? asParams<AttendanceParams>(rule).relaxationAuthority : "VC";
  if (user.role !== authority) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "RelaxationRequest", entityId: id, summary: `Attempted to decide a relaxation reserved for ${authority}` });
    return { error: `Only the configured authority (${authority}) may decide this request.` };
  }
  const updated = await db.relaxationRequest.update({
    where: { id },
    data: { status: decision, decidedById: user.id, decidedAt: new Date(), decisionNote: note || null },
  });
  await audit({
    actorId: user.id, actorRole: user.role, action: decision === "APPROVED" ? "RELAXATION_APPROVED" : "RELAXATION_REJECTED",
    entity: "RelaxationRequest", entityId: id,
    summary: `${decision === "APPROVED" ? "Approved" : "Rejected"} attendance relaxation for ${req.student.name} in ${req.enrolment.course.code}${note ? ` — ${note}` : ""}`,
    before: { status: req.status }, after: { status: updated.status, decisionNote: note || null },
  });
  await computeEligibility(req.examId, undefined, [req.enrolmentId]);
  revalidatePath("/relaxations");
  revalidatePath(`/exams/${req.examId}`);
  return { ok: true };
}
