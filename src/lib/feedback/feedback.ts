import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { COURSE_TEMPLATE, INSTITUTION_TEMPLATE, summarise, type Answers, type Question } from "./shared";

type Actor = { id: string; role: string };
export const MANAGER_ROLES = ["IQAC", "ADMIN"];
export const VIEWER_ROLES = ["IQAC", "ADMIN", "VC", "HOD", "COE", "ACADEMIC_STAFF", "REGISTRAR"];

const today = () => new Date(new Date().toISOString().slice(0, 10));
export const questionsOf = (form: { questions: Prisma.JsonValue }) => form.questions as unknown as Question[];

export function isOpen(form: { status: string; opensAt: Date; closesAt: Date }) {
  const now = Date.now();
  return form.status === "OPEN" && form.opensAt.getTime() <= now && form.closesAt.getTime() >= now;
}

/** Everything a student still owes or has already given, across open forms. */
/** Students in the final semester of their programme, or with an exit request, are the audience of exit surveys. */
export async function isLeaving(studentId: string) {
  const s = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: { include: { programme: true } }, exitRequest: true } });
  return s.batch.currentSemester >= s.batch.programme.durationSemesters || !!s.exitRequest;
}

export async function studentFeedback(studentId: string) {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const leaving = await isLeaving(studentId);
  const forms = (await db.feedbackForm.findMany({ where: { status: "OPEN" }, orderBy: { opensAt: "asc" } })).filter((f) => isOpen(f) && (f.type !== "EXIT" || leaving));
  const done = await db.feedbackSubmission.findMany({ where: { studentId, formId: { in: forms.map((f) => f.id) } } });
  const items: { formId: string; formTitle: string; closesAt: Date; courseId: string; code: string | null; title: string; teacher: string | null; done: boolean }[] = [];
  for (const f of forms) {
    if (f.type === "COURSE") {
      const enrolments = await db.enrolment.findMany({ where: { studentId, academicYear: f.academicYear, status: "ACTIVE" }, include: { course: { include: { faculty: true } } }, orderBy: { course: { code: "asc" } } });
      for (const e of enrolments.filter((x) => x.course.facultyId)) {
        items.push({ formId: f.id, formTitle: f.title, closesAt: f.closesAt, courseId: e.courseId, code: e.course.code, title: e.course.title, teacher: e.course.faculty?.name ?? null, done: done.some((d) => d.formId === f.id && d.courseId === e.courseId) });
      }
    } else {
      items.push({ formId: f.id, formTitle: f.title, closesAt: f.closesAt, courseId: "", code: null, title: f.title, teacher: null, done: done.some((d) => d.formId === f.id) });
    }
  }
  return { student, items };
}

export async function submitFeedback(studentId: string, formId: string, courseId: string, answers: Answers, actor: Actor) {
  const form = await db.feedbackForm.findUnique({ where: { id: formId } });
  if (!form || !isOpen(form)) return { error: "This feedback form is not open." };
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  let course: { id: string; code: string; facultyId: string | null } | null = null;
  if (form.type === "COURSE") {
    const enrol = await db.enrolment.findFirst({ where: { studentId, courseId, academicYear: form.academicYear, status: "ACTIVE" }, include: { course: true } });
    if (!enrol) return { error: "You are not registered for this course." };
    course = enrol.course;
  } else courseId = "";
  if (await db.feedbackSubmission.findUnique({ where: { formId_studentId_courseId: { formId, studentId, courseId } } })) return { error: "You have already given this feedback." };

  const clean: Answers = {};
  for (const q of questionsOf(form)) {
    const v = answers[q.id];
    if (q.kind === "LIKERT") {
      if (typeof v !== "number" || ![1, 2, 3, 4, 5].includes(v)) {
        if (q.required) return { error: `Please answer: “${q.text}”` };
        continue;
      }
      clean[q.id] = v;
    } else if (typeof v === "string" && v.trim()) clean[q.id] = v.trim().slice(0, 1000);
  }
  await db.$transaction([
    db.feedbackSubmission.create({ data: { formId, studentId, courseId, submittedOn: today() } }),
    db.feedbackResponse.create({ data: { formId, courseId, facultyId: course?.facultyId ?? null, batchId: student.batchId, answers: clean as Prisma.InputJsonValue, submittedOn: today() } }),
  ]);
  await audit({ actorId: actor.id, actorRole: actor.role, action: "FEEDBACK_SUBMITTED", entity: "FeedbackForm", entityId: formId, summary: `Anonymous feedback submitted${course ? ` for ${course.code}` : ""} (${form.title}); responses are stored without the student's identity` });
  return { ok: true };
}

/** Course-wise results for a form; enrolled counts give the response rate. */
export async function formAnalytics(formId: string, facultyId?: string) {
  const form = await db.feedbackForm.findUniqueOrThrow({ where: { id: formId } });
  const questions = questionsOf(form);
  const responses = await db.feedbackResponse.findMany({ where: { formId, ...(facultyId ? { facultyId } : {}) } });
  if (form.type === "EXIT") {
    const eligible = await db.exitRequest.count();
    return { form, questions, overall: summarise(responses, questions), eligible, courses: [] };
  }
  if (form.type === "INSTITUTION") {
    const eligible = await db.student.count({ where: { status: "ACTIVE" } });
    return { form, questions, overall: summarise(responses, questions), eligible, courses: [] };
  }
  const courses = await db.course.findMany({
    where: { ...(facultyId ? { facultyId } : { facultyId: { not: null } }), enrolments: { some: { academicYear: form.academicYear, status: "ACTIVE" } } },
    include: { faculty: true, _count: { select: { enrolments: { where: { academicYear: form.academicYear, status: "ACTIVE" } } } } },
    orderBy: { code: "asc" },
  });
  const rows = courses.map((c) => {
    const s = summarise(responses.filter((r) => r.courseId === c.id), questions);
    return { id: c.id, code: c.code, title: c.title, teacher: c.faculty?.name ?? "—", facultyId: c.facultyId, enrolled: c._count.enrolments, summary: s, rate: c._count.enrolments ? Math.round((s.n / c._count.enrolments) * 100) : 0 };
  });
  return { form, questions, overall: summarise(responses, questions), eligible: rows.reduce((a, r) => a + r.enrolled, 0), courses: rows };
}

/** Teachers see only their own courses, only after IQAC releases a closed form, and only with enough responses to stay anonymous. */
export function facultyVisibility(form: { status: string; releasedToFaculty: boolean; minResponses: number }, n: number) {
  if (form.status !== "CLOSED" || !form.releasedToFaculty) return { visible: false, reason: "Results are shared with teachers after the feedback window closes and IQAC releases them." };
  if (n < form.minResponses) return { visible: false, reason: `Fewer than ${form.minResponses} responses — withheld to protect student anonymity.` };
  return { visible: true, reason: null };
}

export async function setFormStatus(formId: string, change: "OPEN" | "CLOSED" | "RELEASE", actor: Actor) {
  if (!MANAGER_ROLES.includes(actor.role)) return { error: "Only the IQAC can open, close or release feedback." };
  const form = await db.feedbackForm.findUniqueOrThrow({ where: { id: formId } });
  if (change === "OPEN") {
    if (form.status !== "DRAFT") return { error: "Only a draft form can be opened." };
    const opensAt = form.opensAt.getTime() > Date.now() ? form.opensAt : new Date();
    await db.feedbackForm.update({ where: { id: formId }, data: { status: "OPEN", opensAt } });
  } else if (change === "CLOSED") {
    if (form.status !== "OPEN") return { error: "Only an open form can be closed." };
    await db.feedbackForm.update({ where: { id: formId }, data: { status: "CLOSED", closesAt: new Date(Math.min(Date.now(), form.closesAt.getTime())) } });
  } else {
    if (form.status !== "CLOSED") return { error: "Close the form before releasing results to teachers." };
    await db.feedbackForm.update({ where: { id: formId }, data: { releasedToFaculty: true } });
  }
  const responses = await db.feedbackResponse.count({ where: { formId } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: change === "RELEASE" ? "FEEDBACK_RELEASED" : change === "OPEN" ? "FEEDBACK_OPENED" : "FEEDBACK_CLOSED", entity: "FeedbackForm", entityId: formId,
    summary: `${form.title}: ${change === "RELEASE" ? "course-wise results released to teachers (courses with at least " + form.minResponses + " responses)" : change === "OPEN" ? "opened to students" : `closed with ${responses} responses`}`,
  });
  return { ok: true };
}

export async function createForm(type: "COURSE" | "INSTITUTION", title: string, academicYear: string, opensAt: Date, closesAt: Date, actor: Actor) {
  if (!MANAGER_ROLES.includes(actor.role)) return { error: "Only the IQAC can create feedback forms." };
  if (title.trim().length < 5) return { error: "Give the form a title." };
  if (!(closesAt > opensAt)) return { error: "The closing date must be after the opening date." };
  const form = await db.feedbackForm.create({
    data: { type, title: title.trim(), academicYear, opensAt, closesAt, createdById: actor.id, questions: (type === "COURSE" ? COURSE_TEMPLATE : INSTITUTION_TEMPLATE) as unknown as Prisma.InputJsonValue },
  });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "FEEDBACK_FORM_CREATED", entity: "FeedbackForm", entityId: form.id, summary: `${form.title} created as a draft from the ${type === "COURSE" ? "course & teacher" : "student satisfaction"} template` });
  return { ok: true, id: form.id };
}

export async function updateQuestions(formId: string, questions: Question[], actor: Actor) {
  if (!MANAGER_ROLES.includes(actor.role)) return { error: "Only the IQAC can edit questions." };
  const form = await db.feedbackForm.findUniqueOrThrow({ where: { id: formId } });
  if (form.status !== "DRAFT") return { error: "Questions are locked once a form is opened, so every response answers the same questionnaire." };
  const clean = questions.filter((q) => q.text.trim()).map((q, i) => ({ ...q, id: q.id || `x${i + 1}`, text: q.text.trim(), section: q.section.trim() || "General" }));
  if (!clean.some((q) => q.kind === "LIKERT")) return { error: "Add at least one rating question." };
  if (new Set(clean.map((q) => q.id)).size !== clean.length) return { error: "Question identifiers must be unique." };
  await db.feedbackForm.update({ where: { id: formId }, data: { questions: clean as unknown as Prisma.InputJsonValue } });
  return { ok: true };
}

export async function addAction(formId: string, courseId: string, note: string, actor: Actor) {
  if (!["IQAC", "HOD", "ADMIN"].includes(actor.role)) return { error: "Only the IQAC or the Dean can record action taken." };
  if (note.trim().length < 10) return { error: "Describe the action taken." };
  await db.feedbackAction.create({ data: { formId, courseId, note: note.trim(), createdById: actor.id } });
  const course = courseId ? await db.course.findUnique({ where: { id: courseId } }) : null;
  await audit({ actorId: actor.id, actorRole: actor.role, action: "FEEDBACK_ACTION_RECORDED", entity: "FeedbackForm", entityId: formId, summary: `Action taken recorded${course ? ` for ${course.code}` : ""}: ${note.trim().slice(0, 120)}` });
  return { ok: true };
}

/** NAAC 1.4 / IQAC export: one row per course with response rate, index and per-question means, plus action taken. */
export async function exportCsv(formId: string) {
  const a = await formAnalytics(formId);
  const actions = await db.feedbackAction.findMany({ where: { formId }, orderBy: { createdAt: "asc" } });
  const likert = a.questions.filter((q) => q.kind === "LIKERT");
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Course code", "Course", "Teacher", "Enrolled", "Responses", "Response rate %", "Index (1-5)", ...likert.map((q) => `${q.id}: ${q.text}`), "Action taken"];
  const rows = a.form.type !== "COURSE"
    ? [["—", a.form.title, "—", a.eligible, a.overall.n, a.eligible ? Math.round((a.overall.n / a.eligible) * 100) : 0, a.overall.index, ...a.overall.perQuestion.map((q) => q.mean), actions.map((x) => x.note).join(" | ")]]
    : a.courses.map((c) => [c.code, c.title, c.teacher, c.enrolled, c.summary.n, c.rate, c.summary.index, ...c.summary.perQuestion.map((q) => q.mean), actions.filter((x) => x.courseId === c.id).map((x) => x.note).join(" | ")]);
  return { filename: `${a.form.title.replace(/[^A-Za-z0-9]+/g, "_")}.csv`, body: [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") };
}
