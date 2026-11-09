import "server-only";
import { db } from "../db";
import { activeSignInVersion } from "./settings";
import { SIGNIN_VERSIONS, V1_SUNSET, type SignInVersion } from "./versions";

/** Reads the JSON body of a sign-in API call; undefined if it is not a JSON object. */
export async function jsonBody(req: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

/** Version in use, sign-in API calls per version in the last 7 days and the most recent switches. */
export async function signInVersionOverview() {
  const since = new Date(Date.now() - 7 * 86400_000);
  const calls = (v: SignInVersion) => db.apiCallLog.count({ where: { path: { startsWith: `/api/${v}/auth/` }, at: { gte: since } } });
  const [live, v1, v2, history] = await Promise.all([
    activeSignInVersion(),
    calls("v1"),
    calls("v2"),
    db.auditLog.findMany({ where: { action: "SIGNIN_VERSION_CHANGED" }, orderBy: { id: "desc" }, take: 5, include: { actor: { select: { name: true } } } }),
  ]);
  return { live, calls: { v1, v2 }, history };
}

/** JSON response stamped with its API version; v1 announces its retirement while v2 is the live version. */
export async function versioned(req: Request, version: SignInVersion, started: number, status: number, body: unknown) {
  const headers: Record<string, string> = { "Cache-Control": "no-store", "API-Version": SIGNIN_VERSIONS[version].api };
  if (version === "v1" && (await activeSignInVersion()) === "v2") {
    headers["Deprecation"] = "true";
    headers["Sunset"] = V1_SUNSET.toUTCString();
    headers["Link"] = `</api/v2${new URL(req.url).pathname.replace(/^\/api\/v1/, "")}>; rel="successor-version"`;
  }
  await db.apiCallLog.create({ data: { method: req.method, path: new URL(req.url).pathname, status, ms: Date.now() - started } });
  return Response.json(body, { status, headers });
}
