import { SIGNIN_VERSIONS, type SignInVersion } from "../auth/versions";

/** OpenAPI 3.0 description of the partner API, served at /api/v1/openapi.json and rendered on the Integrations page. */
export const ENDPOINTS = [
  { method: "GET", path: "/api/v1/students", scope: "students:read", summary: "List students", params: "batch (e.g. BALLB-2022), status (ACTIVE | COMPLETED | GRADUATED | WITHDRAWN), limit (≤ 200), offset", example: "/api/v1/students?batch=BALLB-2022&limit=5" },
  { method: "GET", path: "/api/v1/students/{uid}", scope: "students:read", summary: "One student by University ID", params: "uid", example: "/api/v1/students/NLUJA20220001" },
  { method: "GET", path: "/api/v1/students/{uid}/results", scope: "results:read", summary: "Published semester results with course grades", params: "uid", example: "/api/v1/students/NLUJA20220001/results" },
  { method: "GET", path: "/api/v1/programmes", scope: "catalogue:read", summary: "Programmes, curriculum versions and courses", params: "—", example: "/api/v1/programmes" },
  { method: "GET", path: "/api/v1/documents/{code}", scope: "documents:verify", summary: "Verify an issued document", params: "code (8-character verification code)", example: "/api/v1/documents/ABCD1234" },
];

export function openApiSpec(baseUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const e of ENDPOINTS) {
    const params = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    paths[e.path] = {
      get: {
        summary: e.summary,
        security: [{ apiKey: [e.scope] }],
        parameters: params,
        responses: { "200": { description: "OK" }, "401": { description: "Missing or invalid key" }, "403": { description: `Key lacks ${e.scope}` }, "404": { description: "Not found" }, "429": { description: "Rate limit exceeded" } },
      },
    };
  }
  Object.assign(paths, signInPaths("v1"));
  return {
    openapi: "3.0.3",
    info: { title: "NLUJA, Assam — Academic & Examination API", version: "1.0.0", description: "Read-only partner API. Authenticate with 'Authorization: Bearer <API key>'. 60 requests per minute per key. The sign-in endpoints need no key." },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer" } } },
    paths,
  };
}

/** Version 2 currently changes only sign-in; the partner endpoints above remain on v1. */
export function openApiSpecV2(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: { title: "NLUJA, Assam — Sign-in API", version: SIGNIN_VERSIONS.v2.api, description: `Version 2 of the sign-in API. Changes from v1: ${SIGNIN_VERSIONS.v2.changes.join("; ")}.` },
    servers: [{ url: baseUrl }],
    paths: signInPaths("v2"),
  };
}

function signInPaths(v: SignInVersion) {
  const json = (example: unknown) => ({ "application/json": { example } });
  const reply = v === "v1"
    ? { ok: { status: "ok", next: "/dashboard" }, otp: { status: "otp_required" }, error: { status: "error", message: "Invalid email or password." } }
    : {
        ok: { apiVersion: "2.0.0", result: "SIGNED_IN", user: { name: "Ms. J. Bora", role: "ACADEMIC_STAFF" }, session: { expiresAt: "2026-11-09T20:00:00.000Z", lifetimeHours: 8 }, next: "/dashboard" },
        otp: { apiVersion: "2.0.0", result: "OTP_REQUIRED", user: { name: "Dr. R. Baishya", role: "COE" }, otp: { channel: "SMS", sentTo: "+91 ••••• ••4821", length: 6, expiresInSeconds: 300 } },
        error: { apiVersion: "2.0.0", error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
      };
  const headers = { "API-Version": { schema: { type: "string" }, description: `Always ${SIGNIN_VERSIONS[v].api}` } };
  const login = v === "v1" ? { email: "registrar@nluassam.ac.in", password: "Demo@123" } : { email: "registrar@nluassam.ac.in", password: "Demo@123", captchaId: "<captchaId from GET /api/v2/auth/captcha>", captchaAnswer: "48273" };
  return {
    ...(v === "v2" && {
      "/api/v2/auth/captcha": {
        get: {
          summary: "Get a CAPTCHA for the sign-in form (v2)",
          responses: { "200": { description: "A 5-digit code as an image, valid for 2 minutes and one attempt", headers, content: json({ apiVersion: "2.0.0", captchaId: "eyJhbGciOi…", image: "data:image/svg+xml;base64,…", expiresInSeconds: 120 }) } },
        },
      },
    }),
    [`/api/${v}/auth/login`]: {
      post: {
        summary: `Sign in with email and password (${v})`,
        requestBody: { content: json(login) },
        responses: {
          "200": { description: "Signed in, or a one-time password is needed", headers, content: json(reply.otp) },
          ...(v === "v2" && { "400": { description: "CAPTCHA_REQUIRED — the request has no CAPTCHA (e.g. a v1-style request)", headers } }),
          "401": { description: v === "v2" ? "Wrong email or password, or CAPTCHA_INCORRECT / CAPTCHA_EXPIRED" : "Wrong email or password", headers, content: json(reply.error) },
        },
      },
    },
    [`/api/${v}/auth/otp`]: {
      post: {
        summary: `Complete sign-in with the one-time password (${v})`,
        requestBody: { content: json({ otp: "246810" }) },
        responses: { "200": { description: "Signed in", headers, content: json(reply.ok) }, "401": { description: "Wrong or expired code", headers } },
      },
    },
  };
}
