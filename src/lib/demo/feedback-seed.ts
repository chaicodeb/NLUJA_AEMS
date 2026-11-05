import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { COURSE_TEMPLATE, INSTITUTION_TEMPLATE, type Answers } from "../feedback/shared";
import { DEMO_FEEDBACK } from "./constants";
import { rng } from "./scenarios";

const POSITIVE = [
  "Excellent use of recent Supreme Court judgments in every class.",
  "The problem-based discussions made difficult provisions easy to follow.",
  "Very approachable during consultation hours; helped with my project topic.",
  "Clear structure and well-chosen readings.",
  "The moot-style class exercises were very useful for court craft.",
  "Comparative perspectives from other jurisdictions were eye-opening.",
];
const IMPROVE = [
  "More time for revision before the end-semester examination.",
  "Reading list could be shared earlier in the semester.",
  "Project feedback came back late.",
  "A few guest lectures by practitioners would help.",
  "Slides could be uploaded after class.",
];
const TOUGH = [
  "The pace was too fast for students without an economics background.",
  "The end-semester paper went well beyond what was taught in class.",
  "Numerical problems were never practised in class before the examination.",
  "Please provide solved examples and more tutorials.",
];
const SSS_COMMENTS = ["Wi-Fi in the hostels drops frequently in the evenings.", "Please extend library hours during examinations.", "Placement cell should invite more law firms.", "Mess food quality has improved this semester."];

export async function seedFeedback(iqacId: string) {
  const r = rng(20261106);
  const opensAt = new Date("2026-10-26T03:30:00Z");
  const closesAt = new Date("2026-11-20T18:29:59Z");
  const courseForm = await db.feedbackForm.create({
    data: {
      title: "Course & Teacher Feedback — Odd Semester 2026-27", type: "COURSE", academicYear: "2026-27", status: "OPEN", opensAt, closesAt, minResponses: 5, createdById: iqacId,
      description: "Your responses are anonymous. Teachers see only consolidated results, after the window closes, and only where at least five students have responded.",
      questions: COURSE_TEMPLATE as unknown as Prisma.InputJsonValue,
    },
  });
  const sssForm = await db.feedbackForm.create({
    data: {
      title: "Student Satisfaction Survey 2026-27 (NAAC)", type: "INSTITUTION", academicYear: "2026-27", status: "OPEN", opensAt, closesAt, minResponses: 5, createdById: iqacId,
      description: "Annual survey on teaching–learning, resources and support services, reported to NAAC.",
      questions: INSTITUTION_TEMPLATE as unknown as Prisma.InputJsonValue,
    },
  });

  const likert = (mu: number) => Math.max(1, Math.min(5, Math.round(mu + (r() + r() + r() - 1.5) * 1.1)));
  const date = () => new Date(Date.UTC(2026, 9, 26 + Math.floor(r() * 10)));
  const enrolments = await db.enrolment.findMany({ where: { academicYear: "2026-27", status: "ACTIVE", course: { facultyId: { not: null } } }, include: { course: true, student: true }, orderBy: [{ student: { rollNo: "asc" } }, { course: { code: "asc" } }] });
  const teacherMu: Record<string, number> = {};
  for (const u of await db.user.findMany({ where: { role: "FACULTY" } })) teacherMu[u.id] = u.email.startsWith("ananya") ? 4.35 : u.email.startsWith("rituraj") ? 4.0 : 3.75;

  const subs: Prisma.FeedbackSubmissionCreateManyInput[] = [];
  const resps: Prisma.FeedbackResponseCreateManyInput[] = [];
  for (const e of enrolments) {
    const pending = e.student.rollNo === DEMO_FEEDBACK.roll && DEMO_FEEDBACK.pendingCourses.includes(e.course.code);
    const skip = r() > 0.88;
    if (pending || skip) continue;
    const tough = e.course.code === DEMO_FEEDBACK.lowCourse;
    const mu = tough ? 3.0 : teacherMu[e.course.facultyId!] ?? 3.9;
    const answers: Answers = {};
    for (const q of COURSE_TEMPLATE) {
      if (q.kind === "LIKERT") answers[q.id] = likert(mu + (q.id === "q8" ? (tough ? -0.7 : -0.2) : q.id === "q2" && tough ? -0.4 : 0));
      else if (q.id === "c1" && r() < 0.35 && !tough) answers[q.id] = POSITIVE[Math.floor(r() * POSITIVE.length)];
      else if (q.id === "c2" && r() < (tough ? 0.8 : 0.3)) answers[q.id] = (tough ? TOUGH : IMPROVE)[Math.floor(r() * (tough ? TOUGH : IMPROVE).length)];
    }
    const on = date();
    subs.push({ formId: courseForm.id, studentId: e.studentId, courseId: e.courseId, submittedOn: on });
    resps.push({ formId: courseForm.id, courseId: e.courseId, facultyId: e.course.facultyId, batchId: e.student.batchId, answers: answers as Prisma.InputJsonValue, submittedOn: on });
  }
  const students = await db.student.findMany({ orderBy: { rollNo: "asc" } });
  for (const s of students) {
    if (s.rollNo === DEMO_FEEDBACK.roll || r() > 0.8) continue;
    const answers: Answers = {};
    for (const q of INSTITUTION_TEMPLATE) {
      if (q.kind === "LIKERT") answers[q.id] = likert(q.id === "s4" ? 3.1 : q.id === "s5" ? 3.4 : q.id === "s3" ? 4.4 : 3.95);
      else if (r() < 0.3) answers[q.id] = SSS_COMMENTS[Math.floor(r() * SSS_COMMENTS.length)];
    }
    const on = date();
    subs.push({ formId: sssForm.id, studentId: s.id, courseId: "", submittedOn: on });
    resps.push({ formId: sssForm.id, courseId: "", batchId: s.batchId, answers: answers as Prisma.InputJsonValue, submittedOn: on });
  }
  // Answers are inserted in a shuffled order so row order cannot be matched against submissions.
  for (let i = resps.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [resps[i], resps[j]] = [resps[j], resps[i]];
  }
  await db.feedbackSubmission.createMany({ data: subs });
  await db.feedbackResponse.createMany({ data: resps });
}
