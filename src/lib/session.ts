import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { canAccess } from "./roles";

const COOKIE = "nluja_session";
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

export type SessionPayload = { userId: string; role: Role; name: string };

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function deleteSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return readSessionToken(store.get(COOKIE)?.value);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({
    where: { id: session.userId },
    include: { student: { include: { batch: { include: { programme: true } } } }, ward: true },
  });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.isActive) redirect("/login");
  if (roles && !roles.includes(user.role)) await deny(user, "action");
  return user;
}

/** Enforces the navigation permission matrix for a page and logs denials. */
export async function requirePage(path: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccess(user.role, path)) await deny(user, path);
  return user;
}

async function deny(user: CurrentUser, target: string): Promise<never> {
  await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "Route", entityId: target, summary: `Blocked attempt to open ${target}` });
  redirect(`/forbidden?path=${encodeURIComponent(target)}`);
}

export const SESSION_COOKIE = COOKIE;
