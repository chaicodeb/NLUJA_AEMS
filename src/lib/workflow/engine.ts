import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { ROLE_LABELS } from "../roles";
import { PROCESSES, applicable, describeCondition, validateSteps, type ProcessKey, type Step } from "./shared";

type Actor = { id: string; role: string; name?: string };

export async function activeDefinition(process: ProcessKey) {
  const def = await db.workflowDefinition.findFirst({ where: { process, isActive: true }, orderBy: { version: "desc" } });
  if (def) return def;
  return db.workflowDefinition.create({ data: { process, version: 1, steps: PROCESSES[process].defaults as unknown as Prisma.InputJsonValue, changeNote: "Initial configuration (single approval, as before)" } });
}

export async function saveDefinition(process: ProcessKey, steps: Step[], changeNote: string, actor: Actor) {
  if (!["ADMIN", "REGISTRAR", "ACADEMIC_STAFF", "COE", "VC"].includes(actor.role)) return { error: "You are not permitted to change workflows." };
  const error = validateSteps(process, steps);
  if (error) return { error };
  if (changeNote.trim().length < 10) return { error: "Record why the workflow is changing (e.g. the resolution that approved it)." };
  const current = await activeDefinition(process);
  // Pin every request already waiting to the version it was submitted under.
  for (const p of await pendingSubjects(process)) await ensureInstance(process, p.id, p.facts);
  const clean = steps.map((s) => ({ name: s.name.trim(), roles: s.roles, slaDays: Math.round(s.slaDays), ...(s.when ? { when: s.when } : {}) }));
  const next = await db.$transaction(async (tx) => {
    await tx.workflowDefinition.updateMany({ where: { process, isActive: true }, data: { isActive: false } });
    return tx.workflowDefinition.create({ data: { process, version: current.version + 1, steps: clean as unknown as Prisma.InputJsonValue, changeNote: changeNote.trim(), createdById: actor.id } });
  });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "WORKFLOW_CHANGED", entity: "WorkflowDefinition", entityId: next.id,
    summary: `${PROCESSES[process].label}: version ${next.version} — ${clean.map((s) => `${s.name} (${s.roles.map((r) => ROLE_LABELS[r]).join(" / ")}${s.when ? `, only when ${describeCondition(process, s.when)}` : ""})`).join(" → ")}. Reason: ${changeNote.trim()}`,
    before: { version: current.version, steps: current.steps }, after: { version: next.version, steps: clean },
  });
  return { ok: true, version: next.version };
}

async function pendingSubjects(process: ProcessKey): Promise<{ id: string; facts: Record<string, string | number> }[]> {
  if (process === "LEAVE") {
    const rows = await db.leaveRequest.findMany({ where: { status: "PENDING" }, select: { id: true, type: true, fromDate: true, toDate: true } });
    return rows.map((l) => ({ id: l.id, facts: { type: l.type, days: Math.max(1, Math.ceil((l.toDate.getTime() - l.fromDate.getTime()) / 86400000)) } }));
  }
  const rows = await db.profileChangeRequest.findMany({ where: { status: "PENDING" }, select: { id: true, field: true } });
  return rows.map((r) => ({ id: r.id, facts: { field: r.field } }));
}

/** Starts (or returns) the approval chain for one request, fixing the steps that apply to it at that moment. */
export async function ensureInstance(process: ProcessKey, subjectId: string, facts: Record<string, string | number>) {
  const existing = await db.workflowInstance.findUnique({ where: { process_subjectId: { process, subjectId } }, include: { actions: { orderBy: { at: "asc" } }, definition: true } });
  if (existing) return existing;
  const def = await activeDefinition(process);
  const steps = applicable(def.steps as unknown as Step[], facts);
  return db.workflowInstance.create({
    data: { process, subjectId, definitionId: def.id, steps: steps as unknown as Prisma.InputJsonValue },
    include: { actions: { orderBy: { at: "asc" } }, definition: true },
  });
}

/**
 * Records one approver's decision. Returns `final` when the chain is complete (APPROVED) or stopped (REJECTED),
 * so the caller applies the business effect only then.
 */
export async function decideStep(process: ProcessKey, subjectId: string, facts: Record<string, string | number>, approve: boolean, note: string, actor: Actor) {
  const inst = await ensureInstance(process, subjectId, facts);
  if (inst.status !== "PENDING") return { error: "This request has already been decided." };
  const steps = inst.steps as unknown as Step[];
  const step = steps[inst.current];
  if (!step.roles.includes(actor.role as Step["roles"][number])) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "ACCESS_DENIED", entity: "WorkflowInstance", entityId: inst.id, summary: `Tried to decide "${step.name}" (reserved for ${step.roles.map((r) => ROLE_LABELS[r]).join(" / ")})` });
    return { error: `This step — ${step.name} — is for ${step.roles.map((r) => ROLE_LABELS[r]).join(" / ")}.` };
  }
  if (inst.actions.some((a) => a.actorId === actor.id && a.decision === "APPROVED")) {
    await audit({ actorId: actor.id, actorRole: actor.role, action: "SEGREGATION_VIOLATION_BLOCKED", entity: "WorkflowInstance", entityId: inst.id, summary: `Same person tried to approve two steps of one ${PROCESSES[process].label.toLowerCase()}` });
    return { error: "You approved an earlier step of this request — a different person must decide this one." };
  }
  if (!approve && note.trim().length < 5) return { error: "Give a reason for rejecting." };
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { name: true } });
  const last = inst.current === steps.length - 1;
  const final = !approve ? "REJECTED" : last ? "APPROVED" : null;
  await db.$transaction([
    db.workflowAction.create({ data: { instanceId: inst.id, step: inst.current, stepName: step.name, actorId: actor.id, actorName: user?.name ?? actor.name ?? "—", actorRole: actor.role, decision: approve ? "APPROVED" : "REJECTED", note: note.trim() || null } }),
    db.workflowInstance.update({ where: { id: inst.id }, data: final ? { status: final } : { current: inst.current + 1 } }),
  ]);
  if (!final) {
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "WORKFLOW_STEP_APPROVED", entity: "WorkflowInstance", entityId: inst.id,
      summary: `${PROCESSES[process].label}: "${step.name}" approved (step ${inst.current + 1} of ${steps.length}); passed to "${steps[inst.current + 1].name}"${note.trim() ? ` · ${note.trim()}` : ""}`,
    });
  }
  return { ok: true, final, step: step.name, next: final ? null : steps[inst.current + 1].name };
}

export type WorkflowView = { steps: Step[]; current: number; status: string; version: number; actions: { step: number; stepName: string; actorId: string; actorName: string; actorRole: string; decision: string; note: string | null; at: Date }[] };

/** Where each request is in its chain, for the decision screens. */
export async function workflowViews(process: ProcessKey, items: { id: string; facts: Record<string, string | number> }[]) {
  const map = new Map<string, WorkflowView>();
  const existing = await db.workflowInstance.findMany({ where: { process, subjectId: { in: items.map((i) => i.id) } }, include: { actions: { orderBy: { at: "asc" } }, definition: true } });
  const def = await activeDefinition(process);
  for (const it of items) {
    const inst = existing.find((e) => e.subjectId === it.id);
    map.set(
      it.id,
      inst
        ? { steps: inst.steps as unknown as Step[], current: inst.current, status: inst.status, version: inst.definition.version, actions: inst.actions }
        : { steps: applicable(def.steps as unknown as Step[], it.facts), current: 0, status: "PENDING", version: def.version, actions: [] },
    );
  }
  return map;
}

export async function workflowOverview() {
  const out = [];
  for (const process of Object.keys(PROCESSES) as ProcessKey[]) {
    const def = await activeDefinition(process);
    const [versions, inFlight] = await Promise.all([
      db.workflowDefinition.findMany({ where: { process }, orderBy: { version: "desc" } }),
      db.workflowInstance.groupBy({ by: ["definitionId"], where: { process, status: "PENDING" }, _count: true }),
    ]);
    const creators = await db.user.findMany({ where: { id: { in: versions.map((v) => v.createdById ?? "") } }, select: { id: true, name: true } });
    out.push({
      process, spec: PROCESSES[process], active: def, steps: def.steps as unknown as Step[],
      versions: versions.map((v) => ({ ...v, steps: v.steps as unknown as Step[], by: creators.find((c) => c.id === v.createdById)?.name ?? "System", pending: inFlight.find((f) => f.definitionId === v.id)?._count ?? 0 })),
    });
  }
  return out;
}
