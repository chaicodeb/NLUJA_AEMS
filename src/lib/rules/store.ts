import type { Prisma, RuleType } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";

export async function getActiveRule(type: RuleType, programmeId?: string | null) {
  const scoped = programmeId
    ? await db.ruleSet.findFirst({ where: { type, programmeId, isActive: true }, orderBy: { version: "desc" } })
    : null;
  return scoped ?? db.ruleSet.findFirst({ where: { type, programmeId: null, isActive: true }, orderBy: { version: "desc" } });
}

export async function saveRuleVersion(
  key: string,
  params: Record<string, unknown>,
  changeNote: string,
  actor: { id: string; role: string },
) {
  return db.$transaction(async (tx) => {
    const current = await tx.ruleSet.findFirstOrThrow({ where: { key, isActive: true }, orderBy: { version: "desc" } });
    await tx.ruleSet.update({ where: { id: current.id }, data: { isActive: false } });
    const next = await tx.ruleSet.create({
      data: {
        key: current.key,
        type: current.type,
        name: current.name,
        description: current.description,
        programmeId: current.programmeId,
        batchId: current.batchId,
        version: current.version + 1,
        isActive: true,
        params: params as Prisma.InputJsonValue,
        createdById: actor.id,
        changeNote,
      },
    });
    await audit(
      {
        actorId: actor.id,
        actorRole: actor.role,
        action: "RULE_CHANGED",
        entity: "RuleSet",
        entityId: next.id,
        summary: `${current.name}: v${current.version} → v${next.version} — ${changeNote}`,
        before: current.params,
        after: next.params,
      },
      tx,
    );
    return next;
  });
}
