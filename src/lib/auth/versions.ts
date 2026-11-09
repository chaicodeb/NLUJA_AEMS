/** Sign-in versions. Each screen version talks to its own API version; both stay available side by side. */
export const SIGNIN_VERSIONS = {
  v1: {
    api: "1.0.0",
    released: "2026-07-01",
    title: "Sign-in v1",
    summary: "Email and password on one form. The API answers only whether sign-in succeeded and where to go next.",
    endpoints: ["POST /api/v1/auth/login", "POST /api/v1/auth/otp"],
    changes: ["Email and password on a single form", "Response: { status, next } or { status, message }"],
  },
  v2: {
    api: "2.0.0",
    released: "2026-11-09",
    title: "Sign-in v2",
    summary: "The same email-and-password form with a CAPTCHA box. The API refuses a sign-in without the right code, and also returns the user, the second-factor details and the session expiry.",
    endpoints: ["GET /api/v2/auth/captcha", "POST /api/v2/auth/login", "POST /api/v2/auth/otp"],
    changes: [
      "Same form as v1 plus a CAPTCHA (5-digit code, new image after every attempt, valid 2 minutes, usable once)",
      "Breaking: captchaId and captchaAnswer are required — a v1-style request is refused with CAPTCHA_REQUIRED",
      "Response adds user (name, role), OTP channel and expiry, session expiry",
      "Errors as { error: { code, message } } with stable codes (CAPTCHA_INCORRECT, CAPTCHA_EXPIRED, INVALID_CREDENTIALS, OTP_INCORRECT, OTP_EXPIRED)",
    ],
  },
} as const;

export type SignInVersion = keyof typeof SIGNIN_VERSIONS;
export const DEFAULT_SIGNIN_VERSION: SignInVersion = "v1";
export const isSignInVersion = (v: unknown): v is SignInVersion => v === "v1" || v === "v2";

/** v1 keeps working after v2 goes live and is announced for retirement on this date. */
export const V1_SUNSET = new Date("2027-11-30T00:00:00Z");
