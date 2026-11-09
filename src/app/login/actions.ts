"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { deleteSession, getSession } from "@/lib/session";
import { MASKED_PHONE, demoSignIn, verifyOtp } from "@/lib/auth/login";

export type LoginState = { error?: string; mfa?: { name: string; maskedPhone: string } } | undefined;

export async function quickLoginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const r = await demoSignIn(String(formData.get("email") ?? ""));
  if ("error" in r) return { error: r.error };
  if (r.otpRequired) return { mfa: { name: r.user.name, maskedPhone: MASKED_PHONE } };
  redirect("/dashboard");
}

export async function verifyOtpAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const r = await verifyOtp(String(formData.get("otp") ?? ""), "demo account");
  if ("error" in r) return { error: r.error, mfa: r.user ? { name: r.user.name, maskedPhone: MASKED_PHONE } : undefined };
  redirect("/dashboard");
}

export async function logoutAction() {
  const s = await getSession();
  const user = s ? await db.user.findUnique({ where: { id: s.userId } }) : null;
  if (user) await audit({ actorId: user.id, actorRole: user.role, action: "LOGOUT", entity: "Session", summary: "Signed out" });
  await deleteSession();
  redirect("/login");
}
