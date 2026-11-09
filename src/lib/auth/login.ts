import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role, User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { createSession } from "../session";
import { DEMO_OTP } from "../demo/constants";

const MFA_COOKIE = "nluja_mfa";
export const OTP_SECONDS = 300;
export const SESSION_HOURS = 8;
export const MASKED_PHONE = "+91 ••••• ••4821";
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

type Outcome = { user: User; otpRequired: boolean } | { error: string };

/** Checks email and password. Starts the second factor for examination-critical roles, otherwise opens the session. */
export async function passwordSignIn(emailInput: string, password: string, via: string): Promise<Outcome> {
  const email = emailInput.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit({ actorId: user?.id ?? null, action: "LOGIN_FAILED", entity: "Session", summary: `Failed sign-in attempt for ${email} (${via})` });
    return { error: "Invalid email or password." };
  }
  return proceed(user, `password, ${via}`);
}

/** Demo-account buttons: no password, same second factor. */
export async function demoSignIn(email: string): Promise<Outcome> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { error: "Demo account not found. Reset demo data from the admin dashboard." };
  return proceed(user, "demo quick sign-in");
}

async function proceed(user: User, method: string): Promise<Outcome> {
  if (user.mfaEnabled) {
    const token = await new SignJWT({ userId: user.id }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${OTP_SECONDS}s`).sign(key);
    (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: OTP_SECONDS });
    return { user, otpRequired: true };
  }
  await finish(user, method);
  return { user, otpRequired: false };
}

/** Second step for roles with two-factor sign-in. */
export async function verifyOtp(otpInput: string, via: string): Promise<{ user: User } | { error: string; code: "OTP_EXPIRED" | "OTP_INCORRECT"; user?: User }> {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  let userId: string | null = null;
  if (token) {
    try {
      userId = String((await jwtVerify(token, key)).payload.userId);
    } catch {}
  }
  if (!userId) return { error: "Your verification session expired. Please sign in again.", code: "OTP_EXPIRED" };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (otpInput.trim() !== DEMO_OTP) {
    await audit({ actorId: user.id, actorRole: user.role, action: "MFA_FAILED", entity: "Session", summary: `Incorrect one-time password; sign-in rejected (${via})` });
    return { error: "Incorrect one-time password.", code: "OTP_INCORRECT", user };
  }
  (await cookies()).delete(MFA_COOKIE);
  await finish(user, `password + OTP, ${via}`);
  return { user };
}

async function finish(user: { id: string; role: Role; name: string }, method: string) {
  await createSession({ userId: user.id, role: user.role, name: user.name });
  await audit({ actorId: user.id, actorRole: user.role, action: "LOGIN", entity: "Session", summary: `Signed in (${method})` });
}