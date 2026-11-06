import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { CONNECTORS, runDigiLockerQueue } from "../integrations/connectors";

export async function seedIntegrations(users: Record<string, string>) {
  await db.integrationConnector.createMany({ data: CONNECTORS.map((c) => ({ code: c.code, name: c.name, endpoint: c.endpoint })) });

  // Target batch for the legacy-migration demo (graduated 2025; records still in the old system)
  const cur2019 = await db.curriculumVersion.findUniqueOrThrow({ where: { code: "BALLB-CUR-2019" } });
  await db.batch.create({ data: { code: "BALLB-2020", name: "B.A. LL.B. (Hons.) 2020–25", programmeId: cur2019.programmeId, curriculumVersionId: cur2019.id, admissionYear: 2020, currentSemester: 10 } });

  // Two students whose ABC (APAAR) IDs were never captured: their documents cannot reach DigiLocker
  await db.student.updateMany({ where: { name: { in: ["Pranjal Nath", "Simran Kaur"] } }, data: { abcId: null } });

  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const samarth = `nluja_${randomBytes(24).toString("base64url")}`;
  const old = `nluja_${randomBytes(24).toString("base64url")}`;
  const k1 = await db.apiKey.create({
    data: { name: "Samarth e-Governance (nightly sync)", prefix: samarth.slice(0, 14), keyHash: hash(samarth), scopes: ["students:read", "results:read"], createdById: users.admin, createdAt: new Date("2026-08-01T05:00:00Z"), lastUsedAt: new Date("2026-11-05T20:30:00Z") },
  });
  await db.apiKey.create({
    data: { name: "Old hostel ERP bridge", prefix: old.slice(0, 14), keyHash: hash(old), scopes: ["students:read"], createdById: users.admin, createdAt: new Date("2025-06-10T05:00:00Z"), revokedAt: new Date("2026-07-31T10:00:00Z") },
  });
  const calls = [
    ["2026-11-03T20:30:01Z", "/api/v1/students?status=ACTIVE&limit=200", 200, 41],
    ["2026-11-03T20:30:03Z", "/api/v1/students/NLUJA20220001/results", 200, 63],
    ["2026-11-04T20:30:01Z", "/api/v1/students?status=ACTIVE&limit=200", 200, 38],
    ["2026-11-04T20:30:02Z", "/api/v1/programmes", 403, 7],
    ["2026-11-05T20:30:01Z", "/api/v1/students?status=ACTIVE&limit=200", 200, 44],
    ["2026-11-05T20:30:04Z", "/api/v1/students/NLUJA20250013/results", 200, 58],
  ] as const;
  await db.apiCallLog.createMany({ data: calls.map(([at, path, status, ms]) => ({ keyId: k1.id, method: "GET", path, status, ms, at: new Date(at) })) });
  await db.apiCallLog.create({ data: { keyId: null, method: "GET", path: "/api/v1/students", status: 401, ms: 3, at: new Date("2026-11-02T11:12:00Z") } });

  // Certificates issued during seeding were delivered on the day they were issued
  await runDigiLockerQueue(null);
  for (const j of await db.integrationJob.findMany({ where: { status: "DELIVERED" } })) {
    const doc = j.documentId ? await db.document.findUnique({ where: { id: j.documentId } }) : null;
    if (doc) await db.integrationJob.update({ where: { id: j.id }, data: { createdAt: doc.issuedAt, deliveredAt: new Date(doc.issuedAt.getTime() + 6 * 60000) } });
  }
}
