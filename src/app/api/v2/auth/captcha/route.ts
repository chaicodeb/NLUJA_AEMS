import { issueCaptcha } from "@/lib/auth/captcha";
import { versioned } from "@/lib/auth/api";

/** Sign-in API v2: a fresh CAPTCHA → { captchaId, image, expiresInSeconds }. The answer never leaves the server. */
export async function GET(req: Request) {
  const started = Date.now();
  const c = await issueCaptcha();
  return versioned(req, "v2", started, 200, { apiVersion: "2.0.0", captchaId: c.id, image: c.image, expiresInSeconds: c.expiresInSeconds });
}
