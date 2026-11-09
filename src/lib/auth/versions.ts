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
    summary: "Email first, then password, with show/hide password and “remember my email on this device”. The API returns the user, the second-factor details and the session expiry.",
    endpoints: ["POST /api/v2/auth/login", "POST /api/v2/auth/otp"],
    changes: [
      "Two-step form: email, then password; show/hide password; remember email on this device",
      "Response adds user (name, role), OTP channel and expiry, session expiry",
      "Errors as { error: { code, message } } with stable codes (INVALID_CREDENTIALS, OTP_INCORRECT, OTP_EXPIRED)",
      "Breaking: v1's { status } field is replaced by result (SIGNED_IN | OTP_REQUIRED)",
    ],
  },
} as const;

export type SignInVersion = keyof typeof SIGNIN_VERSIONS;
export const DEFAULT_SIGNIN_VERSION: SignInVersion = "v1";
export const isSignInVersion = (v: unknown): v is SignInVersion => v === "v1" || v === "v2";

/** v1 keeps working after v2 goes live and is announced for retirement on this date. */
export const V1_SUNSET = new Date("2027-11-30T00:00:00Z");
