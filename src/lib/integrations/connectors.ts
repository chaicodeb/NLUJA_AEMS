import { db } from "../db";
import { audit } from "../audit";
import { DIGILOCKER_TYPES } from "../docs";
import { firstPerSemester, PUBLISHED_ORDER } from "../results/engine";

type Actor = { id: string; role: string };

export const CONNECTORS = [
  { code: "DIGILOCKER", name: "DigiLocker (NAD) — issuer push", endpoint: "https://issuer-sandbox.digilocker.local/v1/documents", note: "Issued certificates are pushed to the learner's DigiLocker account, keyed on the ABC (APAAR) ID." },
  { code: "ABC", name: "Academic Bank of Credits — credit upload", endpoint: "https://abc-sandbox.local/v1/credits/upload", note: "Earned credits of published results, in the ABC upload format." },
  { code: "PAYMENT", name: "Payment gateway (fees)", endpoint: "https://pg-sandbox.local/v2/orders", note: "Examination, revaluation, convocation and admission fees; callbacks reconcile the payment reference." },
  { code: "SMS", name: "SMS & e-mail (DLT-registered templates)", endpoint: "https://sms-sandbox.local/v1/send", note: "Attendance shortage, result and admission alerts." },
];

const DOC_CODE: Record<string, string> = { GRADE_SHEET: "GDSHT", TRANSCRIPT: "TRNSC", PROVISIONAL: "PVCER", DEGREE: "DGCER", MIGRATION: "MGCER" };
const MAX_ATTEMPTS = 5;

export async function integrationOverview() {
  const [connectors, jobs, counts] = await Promise.all([
    db.integrationConnector.findMany(),
    db.integrationJob.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    db.integrationJob.groupBy({ by: ["connector", "status"], _count: { _all: true } }),
  ]);
  const students = await db.student.findMany({ where: { id: { in: jobs.map((j) => j.studentId).filter((x): x is string => !!x) } }, select: { id: true, name: true, rollNo: true } });
  const count = (c: string, s: string) => counts.find((x) => x.connector === c && x.status === s)?._count._all ?? 0;
  return {
    connectors: CONNECTORS.map((c) => ({ ...c, ...connectors.find((x) => x.code === c.code) })),
    jobs: jobs.map((j) => ({ ...j, student: students.find((s) => s.id === j.studentId) ?? null })),
    digilocker: { pending: count("DIGILOCKER", "PENDING"), delivered: count("DIGILOCKER", "DELIVERED"), failed: count("DIGILOCKER", "FAILED") },
  };
}

/** Delivers due DigiLocker jobs; in production a scheduler runs this every few minutes. */
export async function runDigiLockerQueue(actor: Actor | null, now = new Date()) {
  const conn = await db.integrationConnector.findUniqueOrThrow({ where: { code: "DIGILOCKER" } });
  if (!conn.enabled) return { error: "The DigiLocker connector is switched off." };
  const jobs = await db.integrationJob.findMany({ where: { connector: "DIGILOCKER", status: "PENDING", nextAttemptAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: 500 });
  const docs = await db.document.findMany({ where: { id: { in: jobs.map((j) => j.documentId!).filter(Boolean) } }, include: { student: true } });
  let delivered = 0;
  let retrying = 0;
  let failed = 0;
  for (const job of jobs) {
    const doc = docs.find((d) => d.id === job.documentId);
    const attempts = job.attempts + 1;
    if (!doc || doc.revoked) {
      await db.integrationJob.update({ where: { id: job.id }, data: { status: "FAILED", attempts, lastError: doc ? "Document revoked before delivery — not pushed" : "Document not found" } });
      failed++;
    } else if (conn.simulateOutage) {
      const final = attempts >= MAX_ATTEMPTS;
      await db.integrationJob.update({
        where: { id: job.id },
        data: { attempts, status: final ? "FAILED" : "PENDING", lastError: "HTTP 503 Service Unavailable from DigiLocker issuer API", nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60000) },
      });
      if (final) failed++;
      else retrying++;
    } else if (!doc.student.abcId) {
      await db.integrationJob.update({ where: { id: job.id }, data: { attempts, status: "FAILED", lastError: "Learner not found: no ABC (APAAR) ID on the student record — add it, then retry" } });
      failed++;
    } else {
      await db.integrationJob.update({
        where: { id: job.id },
        data: { attempts, status: "DELIVERED", lastError: null, deliveredAt: now, externalRef: `in.ac.nluja-${DOC_CODE[doc.type] ?? doc.type}-${doc.verifyCode}` },
      });
      delivered++;
    }
  }
  await db.integrationConnector.update({ where: { code: "DIGILOCKER" }, data: { lastRunAt: now } });
  if (actor && jobs.length) {
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "DIGILOCKER_PUSH", entity: "IntegrationConnector", entityId: "DIGILOCKER",
      summary: `DigiLocker queue run: ${delivered} delivered, ${retrying} to retry, ${failed} failed`,
    });
  }
  return { ok: true, processed: jobs.length, delivered, retrying, failed };
}

export async function retryJob(jobId: string, actor: Actor) {
  const job = await db.integrationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "FAILED") return { error: "Only failed deliveries can be retried." };
  await db.integrationJob.update({ where: { id: jobId }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "INTEGRATION_RETRY", entity: "IntegrationJob", entityId: jobId, summary: `${job.label}: delivery re-queued after "${job.lastError}"` });
  return runDigiLockerQueue(actor);
}

export async function setOutage(code: string, on: boolean, actor: Actor) {
  await db.integrationConnector.update({ where: { code }, data: { simulateOutage: on } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "INTEGRATION_TEST_MODE", entity: "IntegrationConnector", entityId: code, summary: `${code}: simulated outage ${on ? "switched on" : "switched off"}` });
  return { ok: true };
}

/** Earned credits from published results, one row per course, in the ABC credit-upload layout. */
export async function abcCreditRows() {
  const students = await db.student.findMany({
    where: { semResults: { some: { run: { status: "PUBLISHED" } } } },
    include: {
      batch: { include: { programme: true } },
      semResults: { where: { run: { status: "PUBLISHED" } }, orderBy: PUBLISHED_ORDER, include: { run: true } },
      courseResults: { where: { run: { status: "PUBLISHED" }, status: "PASS" }, include: { enrolment: { include: { course: true } }, run: true } },
    },
    orderBy: { rollNo: "asc" },
  });
  const rows: (string | number)[][] = [];
  const missing: { name: string; rollNo: string; batch: string; credits: number }[] = [];
  for (const s of students) {
    const sems = firstPerSemester(s.semResults);
    const courses = s.courseResults.filter((c) => sems.some((x) => x.runId === c.runId && x.semester === c.enrolment.semester));
    const credits = courses.reduce((a, c) => a + c.credits, 0);
    if (!s.abcId) {
      missing.push({ name: s.name, rollNo: s.rollNo, batch: s.batch.code, credits });
      continue;
    }
    for (const c of courses) {
      const sem = sems.find((x) => x.runId === c.runId && x.semester === c.enrolment.semester);
      rows.push([
        s.abcId, s.name, s.gender, s.dob ? s.dob.toISOString().slice(0, 10) : "", "NLUJA", s.batch.programme.name, s.uid, c.enrolment.course.code, c.enrolment.course.title,
        c.enrolment.semester, c.enrolment.academicYear, c.credits, c.grade, c.gradePoint, sem?.sgpa ?? "", (sem?.run.publishedAt ?? c.run.publishedAt)?.toISOString().slice(0, 10) ?? "",
      ]);
    }
  }
  const header = ["ABC_ID", "STUDENT_NAME", "GENDER", "DOB", "INSTITUTION_CODE", "PROGRAMME", "ENROLMENT_NO", "COURSE_CODE", "COURSE_TITLE", "SEMESTER", "ACADEMIC_YEAR", "CREDITS_EARNED", "GRADE", "GRADE_POINT", "SGPA", "RESULT_DATE"];
  return { header, rows, missing, students: new Set(rows.map((r) => r[0])).size };
}

export const isDigiLockerType = (t: string) => !!DIGILOCKER_TYPES[t];
