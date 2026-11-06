import { db } from "../db";

type Ev = [type: string, title: string, start: string, end?: string, audience?: string, description?: string];

/** Academic calendar 2026-27 (festival dates as notified by the Government of Assam; synthetic for the demo). */
const CALENDAR: Ev[] = [
  ["TEACHING", "Odd semester classes", "2026-07-20", "2026-11-14"],
  ["EVENT", "Orientation for first-year students", "2026-07-20", "2026-07-22", "STUDENTS"],
  ["HOLIDAY", "Independence Day", "2026-08-15"],
  ["ADMISSION", "Ph.D. admissions: applications open", "2026-08-16", "2026-10-15"],
  ["EXAM", "Mid-semester examinations (odd semester)", "2026-09-14", "2026-09-19"],
  ["HOLIDAY", "Gandhi Jayanti", "2026-10-02"],
  ["EVENT", "Intra-university moot court competition", "2026-10-09", "2026-10-11", "STUDENTS"],
  ["VACATION", "Puja vacation (Durga Puja)", "2026-10-16", "2026-10-24"],
  ["ADMISSION", "Ph.D. entrance test", "2026-11-01"],
  ["ADMISSION", "Ph.D. interviews", "2026-11-04", "2026-11-06"],
  ["HOLIDAY", "Diwali", "2026-11-08"],
  ["DEADLINE", "Attendance cut-off for examination eligibility", "2026-11-14"],
  ["DEADLINE", "Last date for internal assessment marks", "2026-11-16", undefined, "STAFF"],
  ["EXAM", "End-semester examinations (odd semester)", "2026-11-23", "2026-12-05"],
  ["VACATION", "Winter vacation", "2026-12-14", "2027-01-03"],
  ["DEADLINE", "Odd-semester results", "2026-12-31"],
  ["TEACHING", "Even semester classes", "2027-01-04", "2027-04-09"],
  ["HOLIDAY", "Magh Bihu", "2027-01-14", "2027-01-15"],
  ["HOLIDAY", "Republic Day", "2027-01-26"],
  ["EVENT", "14th Annual Convocation", "2027-01-30", undefined, "ALL", "Srimanta Sankaradeva Kalakshetra, Guwahati"],
  ["EXAM", "Mid-semester examinations (even semester)", "2027-02-22", "2027-02-27"],
  ["HOLIDAY", "Holi", "2027-03-22"],
  ["HOLIDAY", "Good Friday", "2027-03-26"],
  ["EXAM", "End-semester examinations (even semester)", "2027-04-12", "2027-05-01"],
  ["VACATION", "Bohag Bihu holidays", "2027-04-14", "2027-04-16"],
  ["VACATION", "Summer vacation", "2027-05-10", "2027-07-11"],
];

export async function seedAcademics(users: Record<string, string>) {
  await db.academicEvent.createMany({
    data: CALENDAR.map(([type, title, start, end, audience, description]) => ({
      academicYear: "2026-27", type, title, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end ?? start}T00:00:00Z`), audience: audience ?? "ALL", description, createdById: users.academic,
    })),
  });
  await db.exam.create({
    data: {
      code: "ESE-EVEN-2027", name: "End Semester Examination (Even Semester), 2026-27", type: "REGULAR", academicYear: "2026-27", parity: "EVEN", status: "PLANNED",
      startDate: new Date("2027-04-12T04:30:00Z"), endDate: new Date("2027-05-01T11:30:00Z"), feeAmount: 1500, timetableGapDays: 1,
    },
  });
}
