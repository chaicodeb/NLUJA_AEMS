import { verifyOtp } from "@/lib/auth/login";
import { jsonBody, versioned } from "@/lib/auth/api";

/** Sign-in API v1, second factor: { otp } → { status: "ok", next } | { status: "error", message }. */
export async function POST(req: Request) {
  const started = Date.now();
  const body = await jsonBody(req);
  if (typeof body?.otp !== "string") return versioned(req, "v1", started, 400, { status: "error", message: "Send the one-time password as JSON." });
  const r = await verifyOtp(body.otp, "sign-in API v1");
  if ("error" in r) return versioned(req, "v1", started, 401, { status: "error", message: r.error });
  return versioned(req, "v1", started, 200, { status: "ok", next: "/dashboard" });
}
