import type { CourseCategory } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";

type Actor = { id: string; role: string };
export const CATEGORIES: CourseCategory[] = ["CORE", "CLINICAL", "OPTIONAL", "HONOURS", "HSS", "SPECIALIZATION", "DISSERTATION", "MOOT"];

export type CourseInput = { id?: string; code: string; title: string; semester: number; credits: number; category: string; schemeId: string; plannedSessions: number; facultyId: string | null };

export async function curriculumDetail(id: string) {
  const cv = await db.curriculumVersion.findUniqueOrThrow({
    where: { id },
    include: {
      programme: true, batches: { include: { _count: { select: { students: true } } } },
      courses: { orderBy: [{ semester: "asc" }, { code: "asc" }], include: { scheme: true, faculty: true, _count: { select: { enrolments: true, examPapers: true } } } },
    },
  });
  const bySem = new Map<number, typeof cv.courses>();
  for (const c of cv.courses) bySem.set(c.semester, [...(bySem.get(c.semester) ?? []), c]);
  const credits = cv.courses.reduce((a, c) => a + c.credits, 0);
  return { cv, bySem, credits, inUse: cv.batches.length > 0 || cv.courses.some((c) => c._count.enrolments > 0) };
}

/** A revision is always a new version: the approved one keeps serving the batches admitted under it. */
export async function cloneCurriculum(sourceId: string, input: { code: string; name: string; effectiveFrom: number }, actor: Actor) {
  const src = await db.curriculumVersion.findUniqueOrThrow({ where: { id: sourceId }, include: { courses: true } });
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,30}$/.test(code)) return { error: "Use a code like BALLB-CUR-2027." };
  if (await db.curriculumVersion.findUnique({ where: { code } })) return { error: "That code is already used." };
  if (input.name.trim().length < 5) return { error: "Give the version a name." };
  if (!(input.effectiveFrom > src.effectiveFrom)) return { error: `The new version must take effect after ${src.effectiveFrom}.` };
  const cv = await db.curriculumVersion.create({
    data: {
      programmeId: src.programmeId, code, name: input.name.trim(), effectiveFrom: input.effectiveFrom, creditsPerCourse: src.creditsPerCourse, totalCredits: src.totalCredits,
      notes: `Draft revision of ${src.code}.`, status: "DRAFT", basedOnCode: src.code,
      courses: { create: src.courses.map((c) => ({ code: c.code, title: c.title, semester: c.semester, credits: c.credits, category: c.category, maxMarks: c.maxMarks, plannedSessions: c.plannedSessions, schemeId: c.schemeId, facultyId: c.facultyId })) },
    },
  });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "CURRICULUM_DRAFTED", entity: "CurriculumVersion", entityId: cv.id, summary: `Draft curriculum ${code} created from ${src.code} (${src.courses.length} courses), effective from ${input.effectiveFrom}` });
  return { ok: true, id: cv.id };
}

export async function saveCourse(curriculumId: string, input: CourseInput, actor: Actor) {
  const cv = await db.curriculumVersion.findUniqueOrThrow({ where: { id: curriculumId }, include: { programme: true } });
  const code = input.code.trim().toUpperCase();
  const existing = input.id ? await db.course.findUnique({ where: { id: input.id }, include: { _count: { select: { enrolments: true } } } }) : null;
  if (input.id && (!existing || existing.curriculumVersionId !== curriculumId)) return { error: "Course not found." };

  if (cv.status !== "DRAFT") {
    // Approved curricula: only the teacher can change; structure is frozen.
    if (!existing) return { error: "Approved curricula cannot gain courses — create a new version." };
    if (existing.code !== code || existing.title !== input.title.trim() || existing.semester !== input.semester || existing.credits !== input.credits || existing.category !== input.category || existing.schemeId !== input.schemeId || existing.plannedSessions !== input.plannedSessions)
      return { error: `${cv.code} is approved; only the teacher can be changed. Create a new version to revise the course.` };
    return assignFaculty(existing.id, input.facultyId, actor);
  }

  if (!/^[A-Z]{2,4}\d{1,2}\.\d{1,2}$/.test(code)) return { error: "Use a course code like BL4.2." };
  if (input.title.trim().length < 4) return { error: "Enter the course title." };
  if (!(input.semester >= 1 && input.semester <= cv.programme.durationSemesters)) return { error: `Semester must be 1–${cv.programme.durationSemesters}.` };
  if (!(input.credits >= 1 && input.credits <= 12)) return { error: "Credits must be between 1 and 12." };
  if (!(CATEGORIES as string[]).includes(input.category)) return { error: "Choose a category." };
  if (!(input.plannedSessions >= 10 && input.plannedSessions <= 120)) return { error: "Planned sessions must be between 10 and 120." };
  if (!(await db.evaluationScheme.findUnique({ where: { id: input.schemeId } }))) return { error: "Choose an evaluation scheme." };
  const clash = await db.course.findFirst({ where: { curriculumVersionId: curriculumId, code, ...(existing ? { id: { not: existing.id } } : {}) } });
  if (clash) return { error: `${code} already exists in this curriculum.` };

  const data = { code, title: input.title.trim(), semester: input.semester, credits: input.credits, category: input.category as CourseCategory, schemeId: input.schemeId, plannedSessions: input.plannedSessions, facultyId: input.facultyId || null };
  const course = existing ? await db.course.update({ where: { id: existing.id }, data }) : await db.course.create({ data: { ...data, curriculumVersionId: curriculumId } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: existing ? "COURSE_UPDATED" : "COURSE_ADDED", entity: "Course", entityId: course.id,
    summary: `${cv.code}: ${code} ${data.title} (Sem ${data.semester}, ${data.credits} credits, ${data.category}) ${existing ? "updated" : "added"}`,
    ...(existing ? { before: { code: existing.code, title: existing.title, semester: existing.semester, credits: existing.credits, category: existing.category } } : {}),
  });
  return { ok: true };
}

export async function deleteCourse(courseId: string, actor: Actor) {
  const c = await db.course.findUnique({ where: { id: courseId }, include: { curriculumVersion: true, _count: { select: { enrolments: true, examPapers: true } } } });
  if (!c) return { error: "Course not found." };
  if (c.curriculumVersion.status !== "DRAFT") return { error: "Courses of an approved curriculum cannot be removed." };
  if (c._count.enrolments || c._count.examPapers) return { error: "Students are registered in this course." };
  await db.course.delete({ where: { id: courseId } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "COURSE_REMOVED", entity: "Course", entityId: courseId, summary: `${c.curriculumVersion.code}: ${c.code} ${c.title} removed from the draft` });
  return { ok: true };
}

export async function approveCurriculum(curriculumId: string, resolution: string, actor: Actor) {
  const { cv, credits, bySem } = await curriculumDetail(curriculumId);
  if (cv.status !== "DRAFT") return { error: "This version is already approved." };
  if (resolution.trim().length < 6) return { error: "Record the Academic Council resolution number and date." };
  const missing = Array.from({ length: cv.programme.durationSemesters }, (_, i) => i + 1).filter((s) => !bySem.get(s)?.length);
  if (missing.length) return { error: `No courses in semester ${missing.join(", ")}.` };
  if (cv.totalCredits && credits !== cv.totalCredits) return { error: `Courses add up to ${credits} credits; the programme requires ${cv.totalCredits}.` };
  await db.curriculumVersion.update({ where: { id: cv.id }, data: { status: "APPROVED", approvalRef: resolution.trim(), approvedAt: new Date() } });
  if (cv.basedOnCode) {
    await db.curriculumVersion.updateMany({ where: { code: cv.basedOnCode, effectiveTo: null }, data: { effectiveTo: cv.effectiveFrom - 1 } });
  }
  await audit({ actorId: actor.id, actorRole: actor.role, action: "CURRICULUM_APPROVED", entity: "CurriculumVersion", entityId: cv.id, summary: `${cv.code} approved (${resolution.trim()}): ${cv.courses.length} courses, ${credits} credits, for batches admitted from ${cv.effectiveFrom}${cv.basedOnCode ? `; ${cv.basedOnCode} closed for later admissions` : ""}` });
  return { ok: true };
}

export async function assignFaculty(courseId: string, facultyId: string | null, actor: Actor) {
  const c = await db.course.findUnique({ where: { id: courseId }, include: { faculty: true, curriculumVersion: true } });
  if (!c) return { error: "Course not found." };
  const next = facultyId ? await db.user.findUnique({ where: { id: facultyId } }) : null;
  if (facultyId && (!next || next.role !== "FACULTY")) return { error: "Choose a member of the faculty." };
  if ((c.facultyId ?? null) === (facultyId || null)) return { ok: true };
  await db.course.update({ where: { id: courseId }, data: { facultyId: facultyId || null } });
  const open = await db.internalMarksSheet.count({ where: { courseId, status: { in: ["DRAFT", "RETURNED"] } } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "FACULTY_ASSIGNED", entity: "Course", entityId: courseId,
    summary: `${c.code} ${c.title}: teacher changed from ${c.faculty?.name ?? "unassigned"} to ${next?.name ?? "unassigned"}${open ? `; ${open} open internal-marks sheet(s) move with the course` : ""}`,
  });
  return { ok: true };
}

/** Teaching load for the current semester: courses with active registrations. */
export async function facultyLoad(academicYear: string) {
  const faculty = await db.user.findMany({ where: { role: "FACULTY" }, orderBy: { name: "asc" } });
  const courses = await db.course.findMany({
    where: { enrolments: { some: { academicYear, status: "ACTIVE" } } },
    include: { curriculumVersion: true, _count: { select: { enrolments: { where: { academicYear, status: "ACTIVE" } } } } },
    orderBy: { code: "asc" },
  });
  const rows = faculty.map((f) => {
    const mine = courses.filter((c) => c.facultyId === f.id);
    return { faculty: f, courses: mine, credits: mine.reduce((a, c) => a + c.credits, 0), weekly: mine.reduce((a, c) => a + Math.round(c.plannedSessions / 13), 0), students: mine.reduce((a, c) => a + c._count.enrolments, 0) };
  });
  return { rows, unassigned: courses.filter((c) => !c.facultyId), courses, faculty };
}
