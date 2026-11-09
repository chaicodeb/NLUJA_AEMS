import { db } from "../db";
import { audit } from "../audit";
import { DEFAULT_SIGNIN_VERSION, isSignInVersion, type SignInVersion } from "./versions";

const SETTING = "signin.version";

/** The sign-in version everyone sees on /login (v1 until the Administrator switches). */
export async function activeSignInVersion(): Promise<SignInVersion> {
  const row = await db.systemSetting.findUnique({ where: { key: SETTING } });
  return isSignInVersion(row?.value) ? row.value : DEFAULT_SIGNIN_VERSION;
}

export async function setSignInVersion(version: string, actor: { id: string; role: string }) {
  if (actor.role !== "ADMIN") return { error: "Only the System Administrator can change the sign-in version." };
  if (!isSignInVersion(version)) return { error: "Unknown version." };
  const before = await activeSignInVersion();
  if (before === version) return { ok: true, unchanged: true };
  await db.systemSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: version, updatedById: actor.id }, update: { value: version, updatedById: actor.id } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "SIGNIN_VERSION_CHANGED", entity: "SystemSetting", entityId: SETTING,
    summary: `Sign-in version changed from ${before} to ${version}${version < before ? " (rollback)" : ""}`,
    before: { version: before }, after: { version },
  });
  return { ok: true };
}
