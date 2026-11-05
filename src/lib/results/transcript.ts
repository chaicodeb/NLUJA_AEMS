import { db } from "../db";
import { audit } from "../audit";
import { issueDocument } from "../docs";
import { getActiveRule } from "../rules/store";
import { asParams, divisionFor, type GradingParams } from "../rules/engine";

export type TranscriptVariant = "OFFICIAL" | "STUDENT_COPY";

export type TranscriptPayload = {
  variant: TranscriptVariant;
  purpose: string | null;
  student: { name: string; rollNo: string; uid: string; abcId: string | null; dob: string | null; programme: string; batch: string; admissionYear: number };
  curriculum: string;
  semesters: {
    semester: number;
    session: string;
    credits: number;
    earnedCredits: number;
    sgpa: number;
    result: string;
    courses: { code: string; title: string; credits: number; grade: string; gradePoint: number; attempt: number }[];
  }[];
  totalCredits: number;
  earnedCredits: number;
  requiredCredits: number | null;
  cgpa: number;
  percentage: number;
  division: string | null;
  status: string;
  issuedOn: string;
};

/** Builds a consolidated transcript from every published semester result of the student. */
export async function buildTranscript(studentId: string, variant: TranscriptVariant, purpose: string | null): Promise<TranscriptPayload | null> {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: { include: { programme: true, curriculumVersion: true } } } });
  const sems = await db.semesterResult.findMany({
    where: { studentId, run: { status: "PUBLISHED" } },
    include: { run: { include: { exam: true } } },
    orderBy: [{ semester: "asc" }, { run: { publishedAt: "desc" } }],
  });
  const latestPerSem: typeof sems = [];
  for (const s of sems) if (!latestPerSem.some((x) => x.semester === s.semester)) latestPerSem.push(s);
  if (!latestPerSem.length) return null;

  const semesters: TranscriptPayload["semesters"] = [];
  for (const s of latestPerSem) {
    const crs = await db.courseResult.findMany({
      where: { runId: s.runId, studentId, enrolment: { semester: s.semester } },
      include: { enrolment: { include: { course: true } } },
      orderBy: { enrolment: { course: { code: "asc" } } },
    });
    semesters.push({
      semester: s.semester,
      session: crs[0]?.enrolment.academicYear ?? s.run.exam.academicYear,
      credits: s.credits,
      earnedCredits: s.earnedCredits,
      sgpa: s.sgpa,
      result: s.result,
      courses: crs.map((c) => ({ code: c.enrolment.course.code, title: c.enrolment.course.title, credits: c.credits, grade: c.grade, gradePoint: c.gradePoint, attempt: c.enrolment.attempt })),
    });
  }

  const last = latestPerSem[latestPerSem.length - 1];
  const rule = await getActiveRule("GRADING");
  const grading = rule ? asParams<GradingParams>(rule) : null;
  const earned = semesters.reduce((a, s) => a + s.earnedCredits, 0);
  const required = student.batch.curriculumVersion.totalCredits;
  const completed = required != null && earned >= required && last.cgpa >= (grading?.degreeMinCgpa ?? 5);
  return {
    variant,
    purpose,
    student: {
      name: student.name, rollNo: student.rollNo, uid: student.uid, abcId: student.abcId, dob: student.dob?.toISOString() ?? null,
      programme: student.batch.programme.name, batch: student.batch.name, admissionYear: student.batch.admissionYear,
    },
    curriculum: student.batch.curriculumVersion.name,
    semesters,
    totalCredits: semesters.reduce((a, s) => a + s.credits, 0),
    earnedCredits: earned,
    requiredCredits: required,
    cgpa: last.cgpa,
    percentage: Math.round(last.cgpa * 10 * 100) / 100,
    division: grading && semesters.every((s) => s.result === "PASS") ? divisionFor(grading, last.cgpa) : null,
    status: completed ? "PROGRAMME COMPLETED" : `IN PROGRESS — Semester ${last.semester} of ${student.batch.programme.durationSemesters} completed`,
    issuedOn: new Date().toISOString(),
  };
}

export async function issueTranscript(studentId: string, variant: TranscriptVariant, purpose: string | null, actor: { id: string; role: string }) {
  const payload = await buildTranscript(studentId, variant, purpose);
  if (!payload) return { error: "No published results are available for this student yet." };
  const doc = await issueDocument({ type: "TRANSCRIPT", studentId, payload: payload as unknown as Record<string, unknown>, issuedById: actor.id });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "TRANSCRIPT_ISSUED", entity: "Document", entityId: doc.id,
    summary: `${variant === "OFFICIAL" ? "Official" : "Student-copy"} consolidated transcript ${doc.verifyCode} issued for ${payload.student.name} (${payload.student.rollNo})${purpose ? ` — ${purpose}` : ""}; ${payload.semesters.length} semesters, CGPA ${payload.cgpa.toFixed(2)}`,
    after: { variant, semesters: payload.semesters.length, cgpa: payload.cgpa },
  });
  return { ok: true, docId: doc.id, verifyCode: doc.verifyCode };
}
