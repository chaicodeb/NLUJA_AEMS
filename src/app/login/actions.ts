"use server";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { DEMO_OTP } from "@/lib/demo/constants";

const MFA_COOKIE = "nluja_mfa";
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

export type LoginState = { error?: string; mfa?: { name: string; maskedPhone: string } } | undefined;

async function startMfa(userId: string) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(key);
  (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
}

async function finishLogin(user: { id: string; role: import("@prisma/client").Role; name: string }, method: string) {
  await createSession({ userId: user.id, role: user.role, name: user.name });
  await audit({ actorId: user.id, actorRole: user.role, action: "LOGIN", entity: "Session", summary: `Signed in (${method})` });
}

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit({ actorId: user?.id ?? null, action: "LOGIN_FAILED", entity: "Session", summary: `Failed sign-in attempt for ${email}` });
    return { error: "Invalid email or password." };
  }
  if (user.mfaEnabled) {
    await startMfa(user.id);
    return { mfa: { name: user.name, maskedPhone: "+91 ••••• ••4821" } };
  }
  await finishLogin(user, "password");
  redirect("/dashboard");
}

export async function quickLoginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { error: "Demo account not found. Reset demo data from the admin dashboard." };
  if (user.mfaEnabled) {
    await startMfa(user.id);
    return { mfa: { name: user.name, maskedPhone: "+91 ••••• ••4821" } };
  }
  await finishLogin(user, "demo quick sign-in");
  redirect("/dashboard");
}

export async function verifyOtpAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const otp = String(formData.get("otp") ?? "").trim();
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return { error: "Your verification session expired. Please sign in again." };
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, key);
    userId = String(payload.userId);
  } catch {
    return { error: "Your verification session expired. Please sign in again." };
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (otp !== DEMO_OTP) {
    await audit({ actorId: user.id, actorRole: user.role, action: "MFA_FAILED", entity: "Session", summary: "Incorrect one-time password; sign-in rejected" });
    return { error: "Incorrect one-time password.", mfa: { name: user.name, maskedPhone: "+91 ••••• ••4821" } };
  }
  (await cookies()).delete(MFA_COOKIE);
  await finishLogin(user, "password + OTP");
  redirect("/dashboard");
}

export async function logoutAction() {
  const s = await getSession();
  const user = s ? await db.user.findUnique({ where: { id: s.userId } }) : null;
  if (user) await audit({ actorId: user.id, actorRole: user.role, action: "LOGOUT", entity: "Session", summary: "Signed out" });
  await deleteSession();
  redirect("/login");
}
