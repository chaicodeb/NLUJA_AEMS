"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { saveRuleVersion } from "@/lib/rules/store";
import { asParams, evaluateAttendance, type AttendanceParams } from "@/lib/rules/engine";

const EDITORS = ["ADMIN", "COE", "ACADEMIC_STAFF"] as const;

export async function saveRuleAction(key: string, params: Record<string, unknown>, note: string) {
  const user = await requireUser([...EDITORS]);
  if (!note.trim()) return { error: "Please record the reason for this change (e.g. Academic Council resolution no.)." };
  const saved = await saveRuleVersion(key, params, note.trim(), { id: user.id, role: user.role });
  revalidatePath("/rules");
  revalidatePath(`/rules/${key}`);
  return { ok: true, version: saved.version };
}

/** What-if: how would current eligibility decisions change under the proposed parameters? */
export async function previewAttendanceImpact(key: string, params: AttendanceParams) {
  await requireUser();
  const rule = await db.ruleSet.findFirstOrThrow({ where: { key, isActive: true } });
  const rows = await db.eligibility.findMany({
    where: { enrolment: { student: { batch: { programmeId: rule.programmeId ?? undefined } } } },
    include: { enrolment: { include: { student: true, course: true } } },
  });
  if (!rows.length) return { computed: false as const };
  const relax = await db.relaxationRequest.findMany({ where: { enrolmentId: { in: rows.map((r) => r.enrolmentId) } }, orderBy: { createdAt: "desc" } });
  const current = asParams<AttendanceParams>(rule);
  const changes: { student: string; course: string; from: string; to: string; pct: number }[] = [];
  for (const r of rows) {
    const latest = relax.find((x) => x.enrolmentId === r.enrolmentId);
    const facts = { coursePct: r.coursePct, aggregatePct: r.aggregatePct, relaxationApproved: latest?.status === "APPROVED", relaxationPending: latest?.status === "PENDING" };
    const before = evaluateAttendance(current, facts).status;
    const after = evaluateAttendance(params, facts).status;
    if (before !== after) changes.push({ student: r.enrolment.student.name, course: r.enrolment.course.code, from: before, to: after, pct: Math.round(r.coursePct * 100) / 100 });
  }
  return { computed: true as const, total: rows.length, changes };
}
