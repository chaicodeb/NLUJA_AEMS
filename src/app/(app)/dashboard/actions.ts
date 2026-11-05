"use server";

import { redirect } from "next/navigation";
import { requireUser, deleteSession } from "@/lib/session";
import { jumpToStage, DEMO_STAGES, type DemoStage } from "@/lib/demo/stages";

export async function resetDemoAction() {
  await requireUser(["ADMIN", "COE"]);
  await jumpToStage("start");
  await deleteSession();
  redirect("/login");
}

export async function jumpStageAction(stage: DemoStage) {
  await requireUser(["ADMIN", "COE"]);
  if (!DEMO_STAGES.some((s) => s.key === stage)) return { error: "Unknown stage" };
  await jumpToStage(stage);
  await deleteSession();
  redirect("/login");
}
