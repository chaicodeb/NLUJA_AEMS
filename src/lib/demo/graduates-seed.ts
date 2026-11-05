import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { gradeFor, type GradingParams } from "../rules/engine";
import { academicYearOf } from "./legacy";
import { genMark, rng } from "./scenarios";

type CourseRef = { id: string; code: string; credits: number };

/** B.A. LL.B. (Hons.) 2021–26: completed all ten semesters in June 2026 and graduates at the next convocation. */
export const GRADUATES_2021: { name: string; gender: "F" | "M"; ability: number; marks?: Record<string, number>; note?: string }[] = [
  { name: "Rituparna Bhuyan", gender: "F", ability: 0.8, note: "Highest CGPA — Chancellor's Gold Medal; demo graduate login" },
  { name: "Kunal Sarma", gender: "M", ability: 0.66 },
  { name: "Ankita Dutta", gender: "F", ability: 0.72, marks: { "BL4.4": 91, "BL5.2": 89 }, note: "Top in Constitutional Law I & II — subject gold medal" },
  { name: "Bikram Chetri", gender: "M", ability: 0.56, marks: { "BL10.3": 38 }, note: "Failed Land Laws of Assam in Semester X — not eligible for the degree" },
  { name: "Nilakshi Gogoi", gender: "F", ability: 0.64, note: "Library dues outstanding — degree withheld until cleared" },
  { name: "Rohan Agarwala", gender: "M", ability: 0.6 },
  { name: "Jahnabi Kalita", gender: "F", ability: 0.7 },
  { name: "Mrinal Deka", gender: "M", ability: 0.56 },
  { name: "Tanya Bora", gender: "F", ability: 0.67 },
  { name: "Sahil Ahmed", gender: "M", ability: 0.58 },
];

export async function seedGraduates(opts: {
  programmeId: string; curriculumId: string; legacyRunId: string; grading: GradingParams; passwordHash: string;
  semesterCourses: Record<number, CourseRef[]>; users: Record<string, string>;
}) {
  const r = rng(20210801);
  const batch = await db.batch.create({ data: { code: "BALLB-2021", name: "B.A. LL.B. (Hons.) 2021–26", programmeId: opts.programmeId, curriculumVersionId: opts.curriculumId, admissionYear: 2021, currentSemester: 10 } });
  const departments = ["LIBRARY", "HOSTEL", "ACCOUNTS", "EXAMINATION"];
  const ids: Record<string, string> = {};

  for (const [i, g] of GRADUATES_2021.entries()) {
    const first = g.name.split(" ")[0].toLowerCase();
    const student = await db.student.create({
      data: {
        uid: `NLUJA2021${String(9001 + i)}`, rollNo: `BAL21-${String(i + 1).padStart(3, "0")}`, name: g.name, gender: g.gender,
        email: `${first}.bal21${String(i + 1).padStart(2, "0")}@students.nluassam.ac.in`, phone: `98641${String(20000 + i * 41).slice(-5)}`,
        category: ["GEN", "OBC", "SC", "ST", "GEN", "EWS"][i % 6], abcId: `ABC${String(410000000000 + i * 6131)}`,
        parentName: `${g.gender === "F" ? "Mr." : "Mrs."} ${g.name.split(" ").slice(-1)[0]}`, parentPhone: `94351${String(30000 + i * 59).slice(-5)}`,
        batchId: batch.id, dob: new Date(2003, i % 12, 3 + i), status: "COMPLETED",
      },
    });
    ids[g.name] = student.id;

    let num = 0;
    let den = 0;
    for (let sem = 1; sem <= 10; sem++) {
      const list = opts.semesterCourses[sem];
      const enrols = await db.enrolment.createManyAndReturn({
        data: list.map((c) => ({ studentId: student.id, courseId: c.id, academicYear: academicYearOf(2021, sem), semester: sem, status: "COMPLETED" })),
        select: { id: true, courseId: true },
      });
      const rows = list.map((c) => {
        const marks = g.marks?.[c.code] ?? Math.max(52, genMark(100, g.ability, r, 0.1));
        const pass = marks >= 50;
        const gr = pass ? gradeFor(opts.grading, marks) : { grade: opts.grading.failGrade, point: 0 };
        return { c, marks, pass, ...gr, enrolmentId: enrols.find((e) => e.courseId === c.id)!.id };
      });
      await db.courseResult.createMany({
        data: rows.map((x) => ({
          runId: opts.legacyRunId, enrolmentId: x.enrolmentId, studentId: student.id, courseId: x.c.id,
          components: [{ code: "TOTAL", name: "Total (migrated)", max: 100, marks: x.marks, pass: 50, ok: x.pass }] as Prisma.InputJsonValue,
          rawTotal: x.marks, total: x.marks, grade: x.grade, gradePoint: x.point, credits: x.c.credits, status: x.pass ? "PASS" : "FAIL",
        })),
      });
      const credits = rows.reduce((a, x) => a + x.c.credits, 0);
      const earned = rows.filter((x) => x.pass).reduce((a, x) => a + x.c.credits, 0);
      const sgpa = Math.round((rows.reduce((a, x) => a + x.c.credits * x.point, 0) / credits) * 100) / 100;
      num += sgpa * credits;
      den += credits;
      const failed = rows.some((x) => !x.pass);
      await db.semesterResult.create({
        data: {
          runId: opts.legacyRunId, studentId: student.id, semester: sem, credits, earnedCredits: earned, sgpa, cgpa: Math.round((num / den) * 100) / 100,
          result: failed ? "FAIL" : "PASS", flags: failed ? ([{ code: "BACKLOG", detail: "1 course to be cleared" }] as Prisma.InputJsonValue) : undefined,
        },
      });
    }
    await db.clearance.createMany({
      data: departments.map((d) =>
        g.name === "Nilakshi Gogoi" && d === "LIBRARY"
          ? { studentId: student.id, department: d, status: "DUES", amount: 1200, note: "2 books overdue: H. M. Seervai, Constitutional Law of India, Vols. 2–3" }
          : { studentId: student.id, department: d, status: "CLEARED", updatedById: opts.users.registrar },
      ),
    });
    if (i === 0) {
      await db.user.create({ data: { name: g.name, email: "graduate@nluassam.ac.in", role: "STUDENT", designation: "B.A. LL.B. (Hons.) 2021–26 — Graduand", passwordHash: opts.passwordHash, studentId: student.id } });
    }
  }

  const convocation = await db.convocation.create({
    data: {
      number: 14, title: "14th Annual Convocation", date: new Date("2027-01-30T05:30:00Z"), venue: "Srimanta Sankaradeva Kalakshetra, Guwahati",
      chiefGuest: "Hon'ble the Chief Justice, Gauhati High Court", status: "APPLICATIONS_OPEN", applicationDeadline: new Date("2026-12-15T18:29:59Z"),
      medals: [
        { code: "CGM", name: "Chancellor's Gold Medal", criterion: { type: "HIGHEST_CGPA", programme: "BALLB" }, description: "Highest CGPA in the B.A. LL.B. (Hons.) programme, all papers cleared at the first attempt" },
        { code: "CONLAW", name: "University Gold Medal in Constitutional Law", criterion: { type: "HIGHEST_TOTAL", courses: ["BL4.4", "BL5.2"] }, description: "Highest aggregate in Constitutional Law-I and II" },
      ] as Prisma.InputJsonValue,
    },
  });
  const applied = ["Kunal Sarma", "Ankita Dutta", "Nilakshi Gogoi", "Rohan Agarwala", "Jahnabi Kalita", "Mrinal Deka", "Tanya Bora", "Sahil Ahmed"];
  await db.degreeApplication.createMany({
    data: applied.map((name, i) => {
      const absentia = name === "Mrinal Deka";
      return {
        convocationId: convocation.id, studentId: ids[name], mode: absentia ? "IN_ABSENTIA" : "IN_PERSON", guests: absentia ? 0 : 1 + (i % 2),
        fee: absentia ? convocation.feeInAbsentia : convocation.feeInPerson, paymentRef: `UPI-${(0x7a10 + i * 977).toString(16).toUpperCase()}${i}`,
        appliedAt: new Date(Date.UTC(2026, 10, 1 + i)),
      };
    }),
  });
}
