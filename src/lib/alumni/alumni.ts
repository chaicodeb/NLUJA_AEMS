import { db } from "../db";
import { audit } from "../audit";

type Actor = { id: string; role: string };

export const SECTORS: Record<string, { label: string; progression: "PLACED" | "HIGHER" | "NONE" }> = {
  LITIGATION: { label: "Litigation / independent practice", progression: "PLACED" },
  LAW_FIRM: { label: "Law firm", progression: "PLACED" },
  CORPORATE: { label: "Corporate legal / in-house", progression: "PLACED" },
  JUDICIARY: { label: "Judicial service", progression: "PLACED" },
  CIVIL_SERVICES: { label: "Civil services / PSU", progression: "PLACED" },
  ACADEMIA: { label: "Academia / research", progression: "PLACED" },
  POLICY_NGO: { label: "Policy, NGO, international organisations", progression: "PLACED" },
  HIGHER_STUDIES: { label: "Higher studies (LL.M., Ph.D., abroad)", progression: "HIGHER" },
  OTHER: { label: "Other", progression: "PLACED" },
  SEEKING: { label: "Preparing / seeking", progression: "NONE" },
};
export const EXAMS = ["Judicial Services", "UGC-NET", "CLAT PG", "Civil Services", "AIBE"];
/** NAAC 5.2.2 counts state/national competitive examinations; AIBE (bar enrolment) is excluded. */
const competitive = (a: { qualifiedExams: string[] }) => a.qualifiedExams.some((e) => e !== "AIBE");

export async function alumniOverview(filter: { year?: number; sector?: string; q?: string }) {
  const all = await db.alumniProfile.findMany({ orderBy: [{ graduationYear: "desc" }, { name: "asc" }] });
  const total = all.length;
  const placed = all.filter((a) => SECTORS[a.sector]?.progression === "PLACED").length;
  const higher = all.filter((a) => SECTORS[a.sector]?.progression === "HIGHER").length;
  const bySector = Object.entries(SECTORS).map(([k, v]) => ({ key: k, label: v.label, count: all.filter((a) => a.sector === k).length })).filter((s) => s.count);
  const years = [...new Set(all.map((a) => a.graduationYear))].sort((a, b) => b - a);
  const byYear = years.map((y) => {
    const rows = all.filter((a) => a.graduationYear === y);
    return { year: y, total: rows.length, placed: rows.filter((a) => SECTORS[a.sector]?.progression === "PLACED").length, higher: rows.filter((a) => SECTORS[a.sector]?.progression === "HIGHER").length, exams: rows.filter(competitive).length };
  });
  const q = filter.q?.trim().toLowerCase();
  const list = all.filter((a) => (!filter.year || a.graduationYear === filter.year) && (!filter.sector || a.sector === filter.sector) && (!q || [a.name, a.organisation, a.city, a.designation].some((v) => v?.toLowerCase().includes(q))));
  return { total, placed, higher, bySector, byYear, years, list, mentors: all.filter((a) => a.mentor).length, exams: all.filter(competitive).length };
}

export async function saveMyProfile(
  studentId: string,
  input: { sector: string; organisation: string; designation: string; city: string; phone: string; qualifiedExams: string[]; directoryConsent: boolean; mentor: boolean },
  actor: Actor,
) {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: { include: { programme: true } } } });
  if (student.batch.currentSemester < student.batch.programme.durationSemesters) return { error: "The alumni network opens to you after you complete the programme." };
  if (!SECTORS[input.sector]) return { error: "Choose what you are doing now." };
  const data = {
    sector: input.sector, organisation: input.organisation.trim() || null, designation: input.designation.trim() || null, city: input.city.trim() || null,
    phone: input.phone.trim() || null, qualifiedExams: input.qualifiedExams.filter((e) => EXAMS.includes(e)), directoryConsent: input.directoryConsent, mentor: input.mentor,
  };
  const year = student.batch.admissionYear + Math.ceil(student.batch.programme.durationSemesters / 2);
  const profile = await db.alumniProfile.upsert({
    where: { studentId },
    create: { studentId, name: student.name, programme: student.batch.programme.code, graduationYear: year, email: student.email, source: "SELF", ...data },
    update: data,
  });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "ALUMNI_PROFILE_UPDATED", entity: "AlumniProfile", entityId: profile.id, summary: `${student.name} updated the alumni profile: ${SECTORS[input.sector].label}${data.organisation ? `, ${data.organisation}` : ""}` });
  return { ok: true };
}

/** NAAC 5.2 (progression) export: one row per alumnus. */
export async function alumniCsv() {
  const rows = await db.alumniProfile.findMany({ orderBy: [{ graduationYear: "desc" }, { name: "asc" }] });
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Programme", "Year of graduation", "Progression", "Sector", "Organisation / institution", "Designation", "City", "Qualified examinations", "Source"];
  const body = rows.map((a) => [a.name, a.programme, a.graduationYear, SECTORS[a.sector]?.progression ?? "", SECTORS[a.sector]?.label ?? a.sector, a.organisation, a.designation, a.city, a.qualifiedExams.join("; "), a.source].map(esc).join(","));
  return [head.map(esc).join(","), ...body].join("\r\n");
}
