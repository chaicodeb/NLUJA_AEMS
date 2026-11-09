import { MASKED_PHONE, OTP_SECONDS, SESSION_HOURS, passwordSignIn } from "@/lib/auth/login";
import { jsonBody, versioned } from "@/lib/auth/api";
import { ROLE_LABELS } from "@/lib/roles";

const API = "2.0.0";

/** Sign-in API v2: { email, password } → { result: "SIGNED_IN" | "OTP_REQUIRED", user, otp?, session?, next? } | { error: { code, message } }. */
export async function POST(req: Request) {
  const started = Date.now();
  const body = await jsonBody(req);
  if (typeof body?.email !== "string" || typeof body.password !== "string")
    return versioned(req, "v2", started, 400, { apiVersion: API, error: { code: "BAD_REQUEST", message: "Send email and password as JSON." } });
  const r = await passwordSignIn(body.email, body.password, "sign-in API v2");
  if ("error" in r) return versioned(req, "v2", started, 401, { apiVersion: API, error: { code: "INVALID_CREDENTIALS", message: r.error } });
  const user = { name: r.user.name, email: r.user.email, role: r.user.role, roleLabel: ROLE_LABELS[r.user.role] };
  if (r.otpRequired)
    return versioned(req, "v2", started, 200, { apiVersion: API, result: "OTP_REQUIRED", user, otp: { channel: "SMS", sentTo: MASKED_PHONE, length: 6, expiresInSeconds: OTP_SECONDS } });
  return versioned(req, "v2", started, 200, {
    apiVersion: API, result: "SIGNED_IN", user,
    session: { expiresAt: new Date(started + SESSION_HOURS * 3600_000).toISOString(), lifetimeHours: SESSION_HOURS },
    next: "/dashboard",
  });
}
