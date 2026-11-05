"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePage } from "@/lib/session";
import { runReport, type ReportConfig } from "@/lib/reports/datasets";

export async function runReportAction(config: ReportConfig) {
  await requirePage("/reports");
  return runReport(config);
}

export async function saveReportAction(name: string, description: string, config: ReportConfig) {
  const user = await requirePage("/reports");
  if (!name.trim()) return { error: "Give the report a name." };
  const saved = await db.savedReport.create({
    data: { name: name.trim(), description: description.trim() || null, dataset: config.dataset, config: config as unknown as Prisma.InputJsonValue, createdById: user.id },
  });
  await audit({ actorId: user.id, actorRole: user.role, action: "REPORT_SAVED", entity: "SavedReport", entityId: saved.id, summary: `Report "${saved.name}" created without vendor involvement` });
  revalidatePath("/reports");
  return { ok: true, id: saved.id };
}
