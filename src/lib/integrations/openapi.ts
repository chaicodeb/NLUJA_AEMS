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
  return {
    openapi: "3.0.3",
    info: { title: "NLUJA, Assam — Academic & Examination API", version: "1.0.0", description: "Read-only partner API. Authenticate with 'Authorization: Bearer <API key>'. 60 requests per minute per key." },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer" } } },
    paths,
  };
}
