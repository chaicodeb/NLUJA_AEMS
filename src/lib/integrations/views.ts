import type { Batch, Programme, Student } from "@prisma/client";

/** Public shape of a student over the API: identifiers and academic status only, no contact or family data. */
export function studentView(s: Student & { batch: Batch & { programme: Programme } }) {
  return {
    uid: s.uid, rollNo: s.rollNo, name: s.name, gender: s.gender, category: s.category, abcId: s.abcId, status: s.status,
    programme: { code: s.batch.programme.code, name: s.batch.programme.name },
    batch: { code: s.batch.code, name: s.batch.name, admissionYear: s.batch.admissionYear, currentSemester: s.batch.currentSemester },
  };
}
