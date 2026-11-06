import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { audit } from "../audit";

type Actor = { id: string; role: string };

export const SCOPES: Record<string, string> = {
  "students:read": "Student directory (no contact or family details)",
  "results:read": "Published semester results and course grades",
  "catalogue:read": "Programmes, curriculum versions and courses",
  "documents:verify": "Verify an issued document by its code",
};
export const RATE_LIMIT_PER_MINUTE = 60;

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

export async function createApiKey(name: string, scopes: string[], actor: Actor) {
  if (name.trim().length < 3) return { error: "Name the system that will use this key." };
  const valid = scopes.filter((s) => SCOPES[s]);
  if (!valid.length) return { error: "Choose at least one permission." };
  const secret = `nluja_${randomBytes(24).toString("base64url")}`;
  const prefix = secret.slice(0, 14);
  const key = await db.apiKey.create({ data: { name: name.trim(), prefix, keyHash: hash(secret), scopes: valid, createdById: actor.id } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "API_KEY_CREATED", entity: "ApiKey", entityId: key.id, summary: `API key ${prefix}… created for "${key.name}" with ${valid.join(", ")}` });
  return { ok: true, secret, prefix };
}

export async function revokeApiKey(id: string, actor: Actor) {
  const key = await db.apiKey.findUnique({ where: { id } });
  if (!key || key.revokedAt) return { error: "Key not found or already revoked." };
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "API_KEY_REVOKED", entity: "ApiKey", entityId: id, summary: `API key ${key.prefix}… ("${key.name}") revoked` });
  return { ok: true };
}

export class ApiNotFound extends Error {}

/** Authenticates the API key, checks the scope and rate limit, runs the handler and logs the call. */
export async function apiHandler(req: Request, scope: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  const url = new URL(req.url);
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-api-key") ?? "";
  const key = header ? await db.apiKey.findUnique({ where: { keyHash: hash(header) } }) : null;
  const respond = async (status: number, body: unknown) => {
    await db.apiCallLog.create({ data: { keyId: key?.id ?? null, method: req.method, path: url.pathname + url.search, status, ms: Date.now() - started } });
    return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE) } });
  };
  if (!key || key.revokedAt) return respond(401, { error: "unauthorised", message: "Send a valid API key as 'Authorization: Bearer <key>'." });
  if (!key.scopes.includes(scope)) return respond(403, { error: "forbidden", message: `This key does not have the ${scope} permission.` });
  const recent = await db.apiCallLog.count({ where: { keyId: key.id, at: { gte: new Date(started - 60000) } } });
  if (recent >= RATE_LIMIT_PER_MINUTE) return respond(429, { error: "rate_limited", message: `More than ${RATE_LIMIT_PER_MINUTE} requests in a minute.` });
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  try {
    return await respond(200, await fn());
  } catch (e) {
    if (e instanceof ApiNotFound) return respond(404, { error: "not_found", message: e.message });
    return respond(500, { error: "server_error", message: "Unexpected error." });
  }
}

export async function apiActivity() {
  const [keys, calls] = await Promise.all([
    db.apiKey.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { calls: true } } } }),
    db.apiCallLog.findMany({ orderBy: { id: "desc" }, take: 25, include: { key: { select: { name: true, prefix: true } } } }),
  ]);
  return { keys, calls };
}
