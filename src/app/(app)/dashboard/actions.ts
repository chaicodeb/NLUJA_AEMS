"use server";

import { redirect } from "next/navigation";
import { requireUser, deleteSession } from "@/lib/session";
import { seedDemo } from "@/lib/demo/seed";

export async function resetDemoAction() {
  await requireUser(["ADMIN", "COE"]);
  await seedDemo();
  await deleteSession();
  redirect("/login");
}
