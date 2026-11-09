import { passwordSignIn } from "@/lib/auth/login";
import { jsonBody, versioned } from "@/lib/auth/api";

/** Sign-in API v1: { email, password } → { status: "ok", next } | { status: "otp_required" } | { status: "error", message }. */
export async function POST(req: Request) {
  const started = Date.now();
  const body = await jsonBody(req);
  if (typeof body?.email !== "string" || typeof body.password !== "string")
    return versioned(req, "v1", started, 400, { status: "error", message: "Send email and password as JSON." });
  const r = await passwordSignIn(body.email, body.password, "sign-in API v1");
  if ("error" in r) return versioned(req, "v1", started, 401, { status: "error", message: r.error });
  if (r.otpRequired) return versioned(req, "v1", started, 200, { status: "otp_required" });
  return versioned(req, "v1", started, 200, { status: "ok", next: "/dashboard" });
}
