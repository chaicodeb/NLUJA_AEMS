import bcrypt from "bcryptjs";
import type { Prisma, Role } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import {
  BALLB_2022,
  BALLB_2025,
  LLM_2026,
  CLASSES_HELD,
  DEMO_PASSWORD,
  attendanceMarks,
  genMark,
  rng,
  type StudentSeed,
} from "./scenarios";
import { LEGACY_BALLB_2019, LEGACY_BALLB_2025, academicYearOf } from "./legacy";
import { gradeFor, type GradingParams } from "../rules/engine";

const TABLES = [
  "RevaluationRequest", "SavedReport", "AuditLog", "Document", "SemesterResult", "CourseResult", "ResultRun", "MarkEntry",
  "Evaluation", "CustodyEvent", "AnswerScript", "MalpracticeCase", "SeatAllocation", "Invigilation", "Room",
  "RegistrationPaper", "ExamRegistration", "RelaxationRequest", "Eligibility", "ExamPaper", "Exam",
  "RuleSet", "AttendanceSummary", "Enrolment", "User", "Student", "Course", "AssessmentComponent",
  "EvaluationScheme", "Batch", "CurriculumVersion", "Programme",
];

export async function wipe() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

type CourseDef = { code: string; title: string; semester: number; credits: number; category: Prisma.CourseCreateManyInput["category"]; scheme: string; faculty?: string };

const GRADE_BANDS = [
  { min: 80, grade: "O", point: 10, label: "Outstanding" },
  { min: 70, grade: "A+", point: 9, label: "Excellent" },
  { min: 65, grade: "A", point: 8, label: "Very Good" },
  { min: 60, grade: "B+", point: 7, label: "Good" },
  { min: 55, grade: "B", point: 6, label: "Above Average" },
  { min: 50, grade: "C", point: 5, label: "Average" },
];

export async function seedDemo() {
  await wipe();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Programmes & curricula ────────────────────────────────────────
  const ballb = await db.programme.create({ data: { code: "BALLB", name: "B.A. LL.B. (Hons.) Five Year Integrated Course", level: "UG", durationSemesters: 10 } });
  const llm = await db.programme.create({ data: { code: "LLM", name: "One Year LL.M. Degree Programme", level: "PG", durationSemesters: 2 } });
  await db.programme.create({ data: { code: "PHD", name: "Ph.D. Degree Programme", level: "DOCTORAL", durationSemesters: 12 } });

  const cur2019 = await db.curriculumVersion.create({
    data: { programmeId: ballb.id, code: "BALLB-CUR-2019", name: "B.A. LL.B. (Hons.) Curriculum — 2019 to 2024 admissions", effectiveFrom: 2019, effectiveTo: 2024, creditsPerCourse: 5, totalCredits: 250, notes: "Each course 100 marks, 5 credits. Sem IX–X theory: 30 mid-semester + 70 end-semester." },
  });
  const cur2025 = await db.curriculumVersion.create({
    data: { programmeId: ballb.id, code: "BALLB-CUR-2025", name: "B.A. LL.B. (Hons.) Curriculum — 2025-26 onwards", effectiveFrom: 2025, creditsPerCourse: 4, totalCredits: 212, notes: "53 courses, 4 credits each (212 credits). Revised as per BCI norms; Mediation compulsory." },
  });
  const curLlm = await db.curriculumVersion.create({
    data: { programmeId: llm.id, code: "LLM-CUR-2024", name: "One Year LL.M. Curriculum", effectiveFrom: 2024, creditsPerCourse: 2, totalCredits: 24, notes: "3 compulsory + 6 specialisation papers + dissertation (150) & viva (50)." },
  });

  // ── Evaluation schemes (from published NLUJA regulations) ─────────
  const schemeDefs: { code: string; name: string; description: string; passRule: string; components: Omit<Prisma.AssessmentComponentCreateManyInput, "schemeId">[] }[] = [
    {
      code: "BALLB-S18", name: "B.A. LL.B. Theory Paper (Sem I–VIII)", passRule: "AGGREGATE",
      description: "Mid-semester 20 + End-semester 50 + Written project 20 + Viva 5 + Attendance 5. Pass: 50 in aggregate.",
      components: [
        { code: "MID", name: "Mid-Semester Examination", maxMarks: 20, group: "THEORY", source: "FACULTY", sortOrder: 1 },
        { code: "END", name: "End-Semester Examination", maxMarks: 50, group: "THEORY", source: "EXAM", sortOrder: 2 },
        { code: "PROJ", name: "Written Project", maxMarks: 20, group: "PRACTICAL", source: "FACULTY", sortOrder: 3 },
        { code: "VIVA", name: "Project Viva-Voce", maxMarks: 5, group: "PRACTICAL", source: "FACULTY", sortOrder: 4 },
        { code: "ATT", name: "Attendance", maxMarks: 5, group: "PRACTICAL", source: "SYSTEM", sortOrder: 5 },
      ],
    },
    {
      code: "BALLB-S910", name: "B.A. LL.B. Theory Paper (Sem IX–X)", passRule: "AGGREGATE",
      description: "Mid-semester 30 + End-semester 70. Pass: 50 in aggregate.",
      components: [
        { code: "MID", name: "Mid-Semester Examination", maxMarks: 30, group: "THEORY", source: "FACULTY", sortOrder: 1 },
        { code: "END", name: "End-Semester Examination", maxMarks: 70, group: "THEORY", source: "EXAM", sortOrder: 2 },
      ],
    },
    {
      code: "BALLB-MOOT", name: "Project Work and Moot Court", passRule: "AGGREGATE",
      description: "Project report 30 + Viva 20 + Moot memorial 25 + Oral argumentation 25 (five criteria × 5).",
      components: [
        { code: "REPORT", name: "Written Project Report", maxMarks: 30, group: "PRACTICAL", source: "FACULTY", sortOrder: 1 },
        { code: "VIVA", name: "Viva-Voce", maxMarks: 20, group: "PRACTICAL", source: "FACULTY", sortOrder: 2 },
        { code: "MEMO", name: "Moot Memorial", maxMarks: 25, group: "PRACTICAL", source: "EXTERNAL", sortOrder: 3 },
        {
          code: "ORAL", name: "Oral Argumentation", maxMarks: 25, group: "PRACTICAL", source: "EXTERNAL", sortOrder: 4,
          subCriteria: [
            { code: "FACTS", name: "Understanding of Facts", max: 5 },
            { code: "LAW", name: "Knowledge of Law", max: 5 },
            { code: "LANG", name: "Command over Language", max: 5 },
            { code: "DEMEANOUR", name: "Demeanour & Court Mannerism", max: 5 },
            { code: "RESPONSE", name: "Response to Court Questions", max: 5 },
          ],
        },
      ],
    },
    {
      code: "LLM-COURSE", name: "LL.M. Taught Paper", passRule: "COMPONENT_AND_AGGREGATE",
      description: "Written 70 (pass 35) + Seminar paper 20 (pass 10) + Viva 10 (pass 5). Each component must be cleared.",
      components: [
        { code: "WRITTEN", name: "Written Examination", maxMarks: 70, passMarks: 35, group: "THEORY", source: "EXAM", sortOrder: 1 },
        { code: "SEMINAR", name: "Seminar Paper (Written)", maxMarks: 20, passMarks: 10, group: "PRACTICAL", source: "FACULTY", sortOrder: 2 },
        { code: "VIVA", name: "Viva-Voce (Oral Presentation)", maxMarks: 10, passMarks: 5, group: "PRACTICAL", source: "FACULTY", sortOrder: 3 },
      ],
    },
    {
      code: "LLM-DISS", name: "LL.M. Dissertation", passRule: "COMPONENT_AND_AGGREGATE",
      description: "Dissertation 150 (external examiner, min 50%) + Viva-voce 50.",
      components: [
        { code: "DISS", name: "Dissertation (External Examiner)", maxMarks: 150, passMarks: 75, group: "PRACTICAL", source: "EXTERNAL", sortOrder: 1 },
        { code: "DVIVA", name: "Dissertation Viva-Voce", maxMarks: 50, group: "PRACTICAL", source: "FACULTY", sortOrder: 2 },
      ],
    },
  ];

  const schemes: Record<string, { id: string; components: { id: string; code: string; maxMarks: number; source: string; subCriteria: Prisma.JsonValue }[] }> = {};
  for (const s of schemeDefs) {
    const created = await db.evaluationScheme.create({
      data: {
        code: s.code, name: s.name, description: s.description, passRule: s.passRule,
        components: { create: s.components.map((c) => ({ ...c, subCriteria: c.subCriteria ?? undefined })) },
      },
      include: { components: true },
    });
    schemes[s.code] = created;
  }

  // ── Staff users ───────────────────────────────────────────────────
  const staff: { key: string; name: string; email: string; role: Role; designation: string; department?: string; mfa?: boolean }[] = [
    { key: "admin", name: "IT Section (Admin)", email: "admin@nluassam.ac.in", role: "ADMIN", designation: "System Administrator", department: "IT Section", mfa: true },
    { key: "vc", name: "Prof. (Dr.) A. K. Sharma", email: "vc@nluassam.ac.in", role: "VC", designation: "Vice-Chancellor" },
    { key: "registrar", name: "Dr. P. K. Medhi", email: "registrar@nluassam.ac.in", role: "REGISTRAR", designation: "Registrar" },
    { key: "coe", name: "Dr. R. Baishya", email: "coe@nluassam.ac.in", role: "COE", designation: "Controller of Examinations", mfa: true },
    { key: "exam", name: "Mr. D. Kalita", email: "exam@nluassam.ac.in", role: "EXAM_STAFF", designation: "Assistant, Examination Branch", mfa: true },
    { key: "academic", name: "Ms. J. Bora", email: "academic@nluassam.ac.in", role: "ACADEMIC_STAFF", designation: "Section Officer, Academic Section" },
    { key: "hod", name: "Prof. N. Goswami", email: "hod@nluassam.ac.in", role: "HOD", designation: "Dean, Undergraduate Studies", department: "Faculty of Law" },
    { key: "iqac", name: "Dr. S. Choudhury", email: "iqac@nluassam.ac.in", role: "IQAC", designation: "IQAC Coordinator" },
    { key: "fac1", name: "Dr. Ananya Bora", email: "ananya.bora@nluassam.ac.in", role: "FACULTY", designation: "Assistant Professor of Law", department: "Constitutional Law" },
    { key: "fac2", name: "Dr. Rituraj Gogoi", email: "rituraj.gogoi@nluassam.ac.in", role: "FACULTY", designation: "Associate Professor of Law", department: "Business Law" },
    { key: "fac3", name: "Dr. Mridusmita Das", email: "mridusmita.das@nluassam.ac.in", role: "FACULTY", designation: "Assistant Professor", department: "Social Sciences" },
    { key: "eval1", name: "Prof. S. Hazarika", email: "eval.hazarika@nluassam.ac.in", role: "EVALUATOR", designation: "External Evaluator", mfa: true },
    { key: "eval2", name: "Dr. M. Lalremruati", email: "eval.lalremruati@nluassam.ac.in", role: "EVALUATOR", designation: "External Evaluator", mfa: true },
  ];
  const users: Record<string, string> = {};
  for (const u of staff) {
    const created = await db.user.create({
      data: { name: u.name, email: u.email, role: u.role, designation: u.designation, department: u.department, passwordHash, mfaEnabled: !!u.mfa },
    });
    users[u.key] = created.id;
  }

  // ── Courses ───────────────────────────────────────────────────────
  const courseDefs: { cur: string; list: CourseDef[] }[] = [
    {
      cur: cur2019.id,
      list: [
        { code: "BL9.1", title: "Human Rights Law", semester: 9, credits: 5, category: "OPTIONAL", scheme: "BALLB-S910", faculty: "fac1" },
        { code: "BL9.2", title: "Principles of Taxation (Direct Tax and GST)", semester: 9, credits: 5, category: "CORE", scheme: "BALLB-S910", faculty: "fac2" },
        { code: "BL9.3", title: "Alternative Dispute Resolution (Clinical-I)", semester: 9, credits: 5, category: "CLINICAL", scheme: "BALLB-S910", faculty: "fac2" },
        { code: "BL9.4", title: "Hons. Paper-V: Comparative Constitutional Law", semester: 9, credits: 5, category: "HONOURS", scheme: "BALLB-S910", faculty: "fac1" },
        { code: "BL9.5", title: "Project Work and Moot Court", semester: 9, credits: 5, category: "MOOT", scheme: "BALLB-MOOT", faculty: "fac2" },
      ],
    },
    {
      cur: cur2025.id,
      list: [
        { code: "BL3.1", title: "Legal and Constitutional History (History-III)", semester: 3, credits: 4, category: "HSS", scheme: "BALLB-S18", faculty: "fac3" },
        { code: "BL3.2", title: "Public Administration (Political Science-III)", semester: 3, credits: 4, category: "HSS", scheme: "BALLB-S18", faculty: "fac3" },
        { code: "BL3.3", title: "Sociology of Law (Sociology-III)", semester: 3, credits: 4, category: "HSS", scheme: "BALLB-S18", faculty: "fac3" },
        { code: "BL3.4", title: "Economics of Finance, Development & Environment (Economics-II)", semester: 3, credits: 4, category: "HSS", scheme: "BALLB-S18", faculty: "fac3" },
        { code: "BL3.5", title: "Jurisprudence & Legal Theory", semester: 3, credits: 4, category: "CORE", scheme: "BALLB-S18", faculty: "fac1" },
        { code: "BL3.6", title: "Special Contracts", semester: 3, credits: 4, category: "CORE", scheme: "BALLB-S18", faculty: "fac2" },
      ],
    },
    {
      cur: curLlm.id,
      list: [
        { code: "ML1.1", title: "Research Methods and Legal Writing", semester: 1, credits: 3, category: "CORE", scheme: "LLM-COURSE", faculty: "fac1" },
        { code: "ML1.2", title: "Comparative Public Law / System of Governance", semester: 1, credits: 3, category: "CORE", scheme: "LLM-COURSE", faculty: "fac1" },
        { code: "ML1.3", title: "Law and Justice in a Globalizing World", semester: 1, credits: 3, category: "CORE", scheme: "LLM-COURSE", faculty: "fac2" },
        { code: "ML1.4", title: "Constitutional Law of India and Expanding Horizons", semester: 1, credits: 2, category: "SPECIALIZATION", scheme: "LLM-COURSE", faculty: "fac1" },
        { code: "ML1.5", title: "Limited Government and Security Legislations in India", semester: 1, credits: 2, category: "SPECIALIZATION", scheme: "LLM-COURSE", faculty: "fac1" },
        { code: "ML1.6", title: "Constitutional Governance and Centre-State Relations", semester: 1, credits: 2, category: "SPECIALIZATION", scheme: "LLM-COURSE", faculty: "fac2" },
        { code: "ML2.4", title: "Dissertation", semester: 2, credits: 3, category: "DISSERTATION", scheme: "LLM-DISS", faculty: "fac1" },
      ],
    },
  ];
  const courses: Record<string, { id: string; code: string; credits: number; scheme: string; semester: number }> = {};
  for (const group of courseDefs) {
    for (const c of group.list) {
      const created = await db.course.create({
        data: {
          curriculumVersionId: group.cur, code: c.code, title: c.title, semester: c.semester, credits: c.credits,
          category: c.category, schemeId: schemes[c.scheme].id, facultyId: c.faculty ? users[c.faculty] : null,
        },
      });
      courses[c.code] = { id: created.id, code: c.code, credits: c.credits, scheme: c.scheme, semester: c.semester };
    }
  }

  // Earlier-semester courses (migrated from legacy records)
  const legacyCourses: Record<string, Record<number, { id: string; code: string; credits: number }[]>> = {};
  for (const [cur, table, credits] of [[cur2019, LEGACY_BALLB_2019, 5], [cur2025, LEGACY_BALLB_2025, 4]] as const) {
    legacyCourses[cur.id] = {};
    for (const [semStr, list] of Object.entries(table)) {
      const sem = Number(semStr);
      legacyCourses[cur.id][sem] = await db.course.createManyAndReturn({
        data: list.map(([code, title, category]) => ({
          curriculumVersionId: cur.id, code, title, semester: sem, credits, category: category as Prisma.CourseCreateManyInput["category"], schemeId: schemes["BALLB-S18"].id,
        })),
        select: { id: true, code: true, credits: true },
      });
    }
  }
  const gradingParams: GradingParams = { bands: GRADE_BANDS, failGrade: "F", failPoint: 0, rounding: 2, divisions: [], degreeMinCgpa: 5 };

  // ── Batches ───────────────────────────────────────────────────────
  const b2022 = await db.batch.create({ data: { code: "BALLB-2022", name: "B.A. LL.B. (Hons.) 2022–27", programmeId: ballb.id, curriculumVersionId: cur2019.id, admissionYear: 2022, currentSemester: 9 } });
  const b2025 = await db.batch.create({ data: { code: "BALLB-2025", name: "B.A. LL.B. (Hons.) 2025–30", programmeId: ballb.id, curriculumVersionId: cur2025.id, admissionYear: 2025, currentSemester: 3 } });
  const bLlm = await db.batch.create({ data: { code: "LLM-2026", name: "LL.M. 2026–27 (Constitutional Law)", programmeId: llm.id, curriculumVersionId: curLlm.id, admissionYear: 2026, currentSemester: 1 } });

  // ── Legacy exam (container for migrated historical results) ───────
  const legacyExam = await db.exam.create({
    data: { code: "LEGACY-MIGRATION", name: "Migrated Historical Results (Samarth / legacy records)", type: "REGULAR", academicYear: "2022-26", parity: "ODD", status: "CLOSED", startDate: new Date("2022-12-01"), endDate: new Date("2026-06-30") },
  });

  // ── Students, enrolments, attendance, internal marks ──────────────
  const r = rng(20261104);
  const cohorts: { batch: typeof b2022; seeds: StudentSeed[]; codes: string[]; prefix: string; sem: number; ay: string; priorSems: number; creditsPerSem: number }[] = [
    { batch: b2022, seeds: BALLB_2022, codes: ["BL9.1", "BL9.2", "BL9.3", "BL9.4", "BL9.5"], prefix: "BAL22", sem: 9, ay: "2026-27", priorSems: 8, creditsPerSem: 25 },
    { batch: b2025, seeds: BALLB_2025, codes: ["BL3.1", "BL3.2", "BL3.3", "BL3.4", "BL3.5", "BL3.6"], prefix: "BAL25", sem: 3, ay: "2026-27", priorSems: 2, creditsPerSem: 24 },
    { batch: bLlm, seeds: LLM_2026, codes: ["ML1.1", "ML1.2", "ML1.3", "ML1.4", "ML1.5", "ML1.6"], prefix: "LLM26", sem: 1, ay: "2026-27", priorSems: 0, creditsPerSem: 15 },
  ];

  const legacyRun = await db.resultRun.create({
    data: {
      examId: legacyExam.id, label: "Legacy data migration — semester results (SGPA/CGPA)", status: "PUBLISHED",
      rulesUsed: { source: "Samarth e-Gov / legacy tabulation registers", reconciled: true },
      processedById: users.admin, publishedById: users.coe, publishedAt: new Date("2026-07-15"), approvedById: users.coe, approvedAt: new Date("2026-07-15"),
    },
  });

  let demoStudentId = "";
  let uidCounter = 0;
  for (const cohort of cohorts) {
    for (let i = 0; i < cohort.seeds.length; i++) {
      const s = cohort.seeds[i];
      uidCounter++;
      const year = cohort.batch.admissionYear;
      const first = s.name.split(" ")[0].toLowerCase();
      const student = await db.student.create({
        data: {
          uid: `NLUJA${year}${String(uidCounter).padStart(4, "0")}`,
          rollNo: `${cohort.prefix}-${String(i + 1).padStart(3, "0")}`,
          name: s.name, gender: s.gender, email: `${first}.${cohort.prefix.toLowerCase()}${String(i + 1).padStart(2, "0")}@students.nluassam.ac.in`,
          phone: `98640${String(10000 + uidCounter * 37).slice(-5)}`,
          category: ["GEN", "OBC", "SC", "ST", "GEN", "EWS"][uidCounter % 6],
          abcId: `ABC${String(400000000000 + uidCounter * 7919)}`,
          parentName: `${s.gender === "F" ? "Mr." : "Mrs."} ${s.name.split(" ").slice(-1)[0]}`,
          parentPhone: `94350${String(20000 + uidCounter * 53).slice(-5)}`,
          batchId: cohort.batch.id,
          dob: new Date(year - 18, uidCounter % 12, 1 + (uidCounter % 27)),
        },
      });
      if (cohort.batch.code === "BALLB-2022" && i === 0) demoStudentId = student.id;

      // migrated prior semesters: course-level grades, with SGPA/CGPA derived from them
      let cgpaNum = 0;
      let cgpaDen = 0;
      for (let sem = 1; sem <= cohort.priorSems; sem++) {
        const semCourses = legacyCourses[cohort.batch.curriculumVersionId][sem];
        const enrols = await db.enrolment.createManyAndReturn({
          data: semCourses.map((c) => ({ studentId: student.id, courseId: c.id, academicYear: academicYearOf(year, sem), semester: sem, status: "COMPLETED" })),
          select: { id: true, courseId: true },
        });
        const rows = semCourses.map((c) => {
          const marks = Math.max(52, genMark(100, s.ability, r, 0.12));
          const g = gradeFor(gradingParams, marks);
          return { course: c, marks, grade: g.grade, point: g.point, enrolmentId: enrols.find((e) => e.courseId === c.id)!.id };
        });
        await db.courseResult.createMany({
          data: rows.map((x) => ({
            runId: legacyRun.id, enrolmentId: x.enrolmentId, studentId: student.id, courseId: x.course.id,
            components: [{ code: "TOTAL", name: "Total (migrated)", max: 100, marks: x.marks, pass: null, ok: true }],
            rawTotal: x.marks, total: x.marks, grade: x.grade, gradePoint: x.point, credits: x.course.credits, status: "PASS",
          })),
        });
        const credits = rows.reduce((a, x) => a + x.course.credits, 0);
        const sgpa = Math.round((rows.reduce((a, x) => a + x.course.credits * x.point, 0) / credits) * 100) / 100;
        cgpaNum += sgpa * credits;
        cgpaDen += credits;
        await db.semesterResult.create({
          data: {
            runId: legacyRun.id, studentId: student.id, semester: sem, credits, earnedCredits: credits,
            sgpa, cgpa: Math.round((cgpaNum / cgpaDen) * 100) / 100, result: "PASS",
          },
        });
      }

      for (const code of cohort.codes) {
        const course = courses[code];
        const enrol = await db.enrolment.create({
          data: { studentId: student.id, courseId: course.id, academicYear: cohort.ay, semester: cohort.sem },
        });
        const base = s.baseAttendance ?? 85;
        const attended = s.attendance?.[code] ?? Math.min(CLASSES_HELD, Math.max(37, Math.round((CLASSES_HELD * base) / 100 + (r() - 0.5) * 2)));
        await db.attendanceSummary.create({
          data: { enrolmentId: enrol.id, classesHeld: CLASSES_HELD, classesAttended: attended, biometricCount: attended },
        });

        const scheme = schemes[course.scheme];
        for (const comp of scheme.components) {
          if (comp.source === "EXAM") continue;
          let marks: number;
          if (comp.source === "SYSTEM") marks = attendanceMarks((attended / CLASSES_HELD) * 100);
          else marks = s.internals?.[code]?.[comp.code] ?? genMark(comp.maxMarks, s.ability, r);
          await db.markEntry.create({
            data: { enrolmentId: enrol.id, componentId: comp.id, marks, status: "SUBMITTED", source: comp.source, enteredById: comp.source === "SYSTEM" ? null : users.fac1 },
          });
        }
      }

      if (cohort.batch.code === "BALLB-2022" && i === 1) {
        await db.user.create({ data: { name: s.name, email: "student2@nluassam.ac.in", role: "STUDENT", designation: "B.A. LL.B. (Hons.) — Semester IX", passwordHash, studentId: student.id } });
      }
      if (cohort.batch.code === "LLM-2026" && s.name === "Sneha Iyer") {
        await db.user.create({ data: { name: s.name, email: "student3@nluassam.ac.in", role: "STUDENT", designation: "LL.M. — Semester I", passwordHash, studentId: student.id } });
      }
      if (cohort.batch.code === "BALLB-2022" && i === 0) {
        await db.user.create({ data: { name: s.name, email: "student@nluassam.ac.in", role: "STUDENT", designation: "B.A. LL.B. (Hons.) — Semester IX", passwordHash, studentId: student.id } });
        await db.user.create({ data: { name: `Mr. Pranab Baruah`, email: "parent@nluassam.ac.in", role: "PARENT", designation: "Parent of Aditi Baruah", passwordHash, wardId: student.id } });
      }
    }
  }

  // ── Rules (configurable, versioned) ───────────────────────────────
  await db.ruleSet.createMany({
    data: [
      {
        key: "ATT-BALLB", type: "ATTENDANCE", name: "B.A. LL.B. attendance & examination eligibility", programmeId: ballb.id,
        description: "BCI-aligned: 70% per course; Vice-Chancellor may relax to 65% in a course on emergency/medical grounds if aggregate ≥ 70%.",
        params: { courseMinPct: 70, relaxationEnabled: true, relaxedCourseMinPct: 65, aggregateMinPct: 70, semesterMinPct: null, relaxationAuthority: "VC", relaxationGrounds: ["MEDICAL", "EMERGENCY"] },
        createdById: users.academic, changeNote: "Initial configuration from RFP Section 8.2",
      },
      {
        key: "ATT-LLM", type: "ATTENDANCE", name: "LL.M. attendance & examination eligibility", programmeId: llm.id,
        description: "UGC / University regulation: 75% in every course; medical relaxation to 65% per course with 70% aggregate.",
        params: { courseMinPct: 75, relaxationEnabled: true, relaxedCourseMinPct: 65, aggregateMinPct: 70, semesterMinPct: null, relaxationAuthority: "VC", relaxationGrounds: ["MEDICAL"] },
        createdById: users.academic, changeNote: "Initial configuration from LL.M. Academic Regulation §4",
      },
      {
        key: "GRADE-NLUJA", type: "GRADING", name: "10-point absolute grading (CBCS)",
        description: "As per Academic Regulation §9: O/A+/A/B+/B/C; below 50 = F. SGPA/CGPA rounded to 2 decimals. CGPA × 10 = percentage.",
        params: {
          bands: GRADE_BANDS, failGrade: "F", failPoint: 0, rounding: 2,
          divisions: [
            { minCgpa: 7, label: "First Class with Distinction" },
            { minCgpa: 6, label: "First Class" },
            { minCgpa: 5, label: "Second Class" },
          ],
          degreeMinCgpa: 5,
        },
        createdById: users.coe, changeNote: "Initial configuration from Academic Regulation §9",
      },
      {
        key: "GRACE-NLUJA", type: "GRACE", name: "Grace marks policy",
        description: "Grace marks only to reach the pass mark; per-course and per-semester caps; never applied to absent candidates.",
        params: { enabled: true, maxPerCourse: 3, maxPerSemester: 5, maxCourses: 2, onlyToPass: true, approvingAuthority: "COE" },
        createdById: users.coe, changeNote: "Initial configuration",
      },
      {
        key: "REVAL-NLUJA", type: "REVALUATION", name: "Revaluation & scrutiny policy",
        description: "Applications within the window after publication; blind re-evaluation by a fresh evaluator; revised marks adopted only when the change meets the threshold.",
        params: { windowDays: 15, feeRevaluation: 1000, feeScrutiny: 300, minChangePct: 5, allowDecrease: true, maxPapers: 3 },
        createdById: users.coe, changeNote: "Initial configuration",
      },
    ],
  });

  // ── Current examination ───────────────────────────────────────────
  const exam = await db.exam.create({
    data: {
      code: "ESE-ODD-2026", name: "End Semester Examination (Odd Semester), 2026-27", type: "REGULAR", academicYear: "2026-27", parity: "ODD",
      status: "REGISTRATION", registrationOpen: true, startDate: new Date("2026-11-23T04:30:00Z"), endDate: new Date("2026-12-05T11:30:00Z"), feeAmount: 1500,
    },
  });
  const paperCodes = [
    { code: "BL9.1", day: 0, session: "FN", mode: "DOUBLE", setter: "fac1" },
    { code: "BL9.2", day: 2, session: "FN" },
    { code: "BL9.3", day: 4, session: "FN" },
    { code: "BL9.4", day: 6, session: "FN" },
    { code: "BL3.1", day: 0, session: "AN" },
    { code: "BL3.2", day: 1, session: "AN" },
    { code: "BL3.3", day: 2, session: "AN" },
    { code: "BL3.4", day: 3, session: "AN" },
    { code: "BL3.5", day: 4, session: "AN" },
    { code: "BL3.6", day: 5, session: "AN" },
    { code: "ML1.1", day: 0, session: "FN" },
    { code: "ML1.2", day: 2, session: "FN" },
    { code: "ML1.3", day: 4, session: "FN" },
    { code: "ML1.4", day: 6, session: "FN" },
    { code: "ML1.5", day: 7, session: "FN" },
    { code: "ML1.6", day: 8, session: "FN" },
  ];
  for (const p of paperCodes) {
    const course = courses[p.code];
    const endComp = schemes[course.scheme].components.find((c) => c.source === "EXAM")!;
    const q = endComp.maxMarks === 50 ? 10 : 14;
    const date = new Date(Date.UTC(2026, 10, 23 + p.day, p.session === "FN" ? 4 : 8, 30));
    await db.examPaper.create({
      data: {
        examId: exam.id, courseId: course.id, date, session: p.session, durationMins: endComp.maxMarks === 50 ? 120 : 150,
        maxMarks: endComp.maxMarks, evaluationMode: p.mode ?? "SINGLE", setterId: p.setter ? users[p.setter] : (p.code.startsWith("BL9") ? users.fac2 : users.fac3),
        questionScheme: Array.from({ length: 5 }, (_, k) => ({ q: `Q${k + 1}`, max: q })),
      },
    });
  }

  await db.room.createMany({
    data: [
      { centre: "Main Campus, Amingaon", code: "AB-G01", name: "Academic Block — Room G-01", rows: 5, cols: 6 },
      { centre: "Main Campus, Amingaon", code: "AB-101", name: "Academic Block — Room 101", rows: 5, cols: 6 },
      { centre: "Main Campus, Amingaon", code: "AB-102", name: "Academic Block — Room 102", rows: 4, cols: 5 },
    ],
  });

  // Pending VC relaxation request (Priyanka Saikia, ADR 67.3%)
  const priyanka = await db.student.findFirstOrThrow({ where: { name: "Priyanka Saikia" } });
  const adrEnrol = await db.enrolment.findFirstOrThrow({ where: { studentId: priyanka.id, course: { code: "BL9.3" } } });
  await db.relaxationRequest.create({
    data: {
      examId: exam.id, studentId: priyanka.id, enrolmentId: adrEnrol.id, ground: "MEDICAL",
      remarks: "Hospitalised 12–19 Sept 2026 (dengue). Discharge summary from GMCH attached.", requestedById: users.academic,
    },
  });

  await db.savedReport.createMany({
    data: [
      {
        name: "Attendance shortfall list (below 75%)", description: "Monthly list for parents' alerts", dataset: "course_results", createdById: users.academic,
        config: { dataset: "course_results", columns: ["rollNo", "name", "batch", "courseCode", "attendancePct", "eligibility"], filters: [{ column: "attendancePct", op: "lt", value: "75" }], sort: { column: "attendancePct", dir: "asc" } },
      },
      {
        name: "Result status by batch (NAAC 2.6.3)", description: "Pass / backlog / withheld counts", dataset: "student_performance", createdById: users.iqac,
        config: { dataset: "student_performance", columns: [], filters: [], groupBy: "result", aggregate: { fn: "count" } },
      },
      {
        name: "Average CGPA by social category (AISHE)", dataset: "student_performance", createdById: users.registrar,
        config: { dataset: "student_performance", columns: [], filters: [], groupBy: "category", aggregate: { fn: "avg", column: "cgpa" } },
      },
    ],
  });

  // Audit: record the seed/migration itself
  await audit({ actorId: users.admin, actorRole: "ADMIN", action: "DATA_MIGRATION", entity: "System", summary: "Legacy records migrated: student master, curricula, SGPA/CGPA history (reconciled)", after: { students: uidCounter, semesterResults: await db.semesterResult.count() } });
  await audit({ actorId: users.academic, actorRole: "ACADEMIC_STAFF", action: "CONFIGURE_RULES", entity: "RuleSet", summary: "Initial attendance, grading and grace rules configured" });
  await audit({ actorId: users.coe, actorRole: "COE", action: "CREATE_EXAM", entity: "Exam", entityId: exam.id, summary: "End Semester Examination (Odd Semester), 2026-27 created; registration opened", after: { code: exam.code, papers: paperCodes.length } });

  return { demoStudentId, students: uidCounter };
}
