import { SESSION_HOURS, verifyOtp } from "@/lib/auth/login";
import { jsonBody, versioned } from "@/lib/auth/api";
import { ROLE_LABELS } from "@/lib/roles";

const API = "2.0.0";

/** Sign-in API v2, second factor: { otp } → { result: "SIGNED_IN", user, session, next } | { error: { code, message } }. */
export async function POST(req: Request) {
  const started = Date.now();
  const body = await jsonBody(req);
  if (typeof body?.otp !== "string") return versioned(req, "v2", started, 400, { apiVersion: API, error: { code: "BAD_REQUEST", message: "Send the one-time password as JSON." } });
  const r = await verifyOtp(body.otp, "sign-in API v2");
  if ("error" in r) return versioned(req, "v2", started, 401, { apiVersion: API, error: { code: r.code, message: r.error } });
  return versioned(req, "v2", started, 200, {
    apiVersion: API, result: "SIGNED_IN",
    user: { name: r.user.name, email: r.user.email, role: r.user.role, roleLabel: ROLE_LABELS[r.user.role] },
    session: { expiresAt: new Date(started + SESSION_HOURS * 3600_000).toISOString(), lifetimeHours: SESSION_HOURS },
    next: "/dashboard",
  });
}
