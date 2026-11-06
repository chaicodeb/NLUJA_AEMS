"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { approveCurriculum, assignFaculty, cloneCurriculum, deleteCourse, saveCourse, type CourseInput } from "@/lib/academics/curriculum";
import { deleteEvent, saveEvent } from "@/lib/academics/calendar";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/academics", "/calendar", "/marks", "/attendance", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function cloneCurriculumAction(sourceId: string, input: { code: string; name: string; effectiveFrom: number }) {
  const user = await requireUser(["ACADEMIC_STAFF", "ADMIN"]);
  const res = await cloneCurriculum(sourceId, input, actorOf(user));
  refresh();
  return res;
}

export async function saveCourseAction(curriculumId: string, input: CourseInput) {
  const user = await requireUser(["ACADEMIC_STAFF", "HOD", "ADMIN"]);
  const res = await saveCourse(curriculumId, input, actorOf(user));
  refresh();
  return res;
}

export async function deleteCourseAction(courseId: string) {
  const user = await requireUser(["ACADEMIC_STAFF", "ADMIN"]);
  const res = await deleteCourse(courseId, actorOf(user));
  refresh();
  return res;
}

export async function approveCurriculumAction(curriculumId: string, resolution: string) {
  const user = await requireUser(["REGISTRAR", "VC", "ADMIN"]);
  const res = await approveCurriculum(curriculumId, resolution, actorOf(user));
  refresh();
  return res;
}

export async function assignFacultyAction(courseId: string, facultyId: string | null) {
  const user = await requireUser(["ACADEMIC_STAFF", "HOD", "ADMIN"]);
  const res = await assignFaculty(courseId, facultyId, actorOf(user));
  refresh();
  return res;
}

export async function saveEventAction(input: { id?: string; title: string; type: string; startDate: string; endDate: string; audience: string; description: string }) {
  const user = await requireUser(["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"]);
  const res = await saveEvent(input, actorOf(user));
  refresh();
  return res;
}

export async function deleteEventAction(id: string) {
  const user = await requireUser(["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"]);
  const res = await deleteEvent(id, actorOf(user));
  refresh();
  return res;
}
