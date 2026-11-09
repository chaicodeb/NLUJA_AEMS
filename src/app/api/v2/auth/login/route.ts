import { MASKED_PHONE, OTP_SECONDS, SESSION_HOURS, passwordSignIn } from "@/lib/auth/login";
import { checkCaptcha } from "@/lib/auth/captcha";
import { jsonBody, versioned } from "@/lib/auth/api";
import { audit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/roles";

const API = "2.0.0";
const CAPTCHA_MESSAGES = {
  CAPTCHA_REQUIRED: "Type the characters shown in the image.",
  CAPTCHA_EXPIRED: "The code has expired. A new one has been shown — please type it.",
  CAPTCHA_INCORRECT: "The code did not match. A new one has been shown — please try again.",
} as const;

/**
 * Sign-in API v2: { email, password, captchaId, captchaAnswer } →
 * { result: "SIGNED_IN" | "OTP_REQUIRED", user, otp?, session?, next? } | { error: { code, message } }.
 * Breaking change from v1: the CAPTCHA fields are required.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const body = await jsonBody(req);
  if (typeof body?.email !== "string" || typeof body.password !== "string")
    return versioned(req, "v2", started, 400, { apiVersion: API, error: { code: "BAD_REQUEST", message: "Send email and password as JSON." } });
  const captcha = await checkCaptcha(body.captchaId, body.captchaAnswer);
  if (captcha !== "OK") {
    if (captcha === "CAPTCHA_INCORRECT") await audit({ action: "CAPTCHA_FAILED", entity: "Session", summary: `Wrong CAPTCHA on sign-in v2 for ${body.email.trim().toLowerCase()}` });
    return versioned(req, "v2", started, captcha === "CAPTCHA_REQUIRED" ? 400 : 401, { apiVersion: API, error: { code: captcha, message: CAPTCHA_MESSAGES[captcha] } });
  }
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
