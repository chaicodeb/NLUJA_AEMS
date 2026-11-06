import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { docsFor, type DocSpec, type MeritRule } from "../admissions/shared";
import { compositeOf } from "../admissions/admissions";
import { rng } from "./scenarios";

const DOCS: DocSpec[] = [
  { code: "PHOTO", label: "Passport-size photograph", hint: "JPG/PNG, plain background" },
  { code: "ID", label: "Aadhaar or other government photo ID" },
  { code: "LLB", label: "LL.B. degree certificate" },
  { code: "LLM", label: "LL.M. marksheets and degree certificate" },
  { code: "PROPOSAL", label: "Research proposal (up to 2,000 words)", hint: "PDF" },
  { code: "CATEGORY", label: "Category certificate (OBC-NCL / EWS issued on or after 1 April 2026)", when: "RESERVED" },
  { code: "PWD", label: "Disability certificate (UDID)", when: "PWD" },
];

const RULE: MeritRule = {
  components: [
    { code: "TEST", label: "Ph.D. Entrance Test", max: 100, weight: 70 },
    { code: "INTERVIEW", label: "Interview and research-proposal presentation", max: 50, weight: 30 },
  ],
  qualifying: { code: "TEST", pct: 50, relaxedPct: 45 },
  eligibility: { degree: "LL.M. or equivalent", minPct: 55, relaxedMinPct: 50 },
  regulation: "UGC (Minimum Standards and Procedures for Award of Ph.D. Degree) Regulations, 2022 — 70% entrance test, 30% interview",
};

type Seed = { name: string; gender: "F" | "M"; category: string; pct: number; test?: number; interview?: number; status?: string; note?: string; pwd?: boolean; net?: boolean };

/** Scenario candidates; the remaining applicants are generated. */
const KEY: Seed[] = [
  { name: "Priya Bora", gender: "F", category: "OBC", pct: 61.5, test: 66, interview: 39, status: "RETURNED", note: "demo applicant login; OBC certificate returned" },
  { name: "Mohammed Arif Hussain", gender: "M", category: "GEN", pct: 68, test: 81, interview: 41, status: "SUBMITTED", note: "documents awaiting verification" },
  { name: "Lalthanpuii Ralte", gender: "F", category: "ST", pct: 58, test: 57, interview: 36, status: "SUBMITTED", note: "documents awaiting verification" },
  { name: "Kaustav Sarma", gender: "M", category: "GEN", pct: 66, test: 74, note: "interview marks to be entered" },
  { name: "Moumita Das", gender: "F", category: "SC", pct: 57.5, test: 52, note: "interview marks to be entered" },
  { name: "Sourav Agarwal", gender: "M", category: "EWS", pct: 60, test: 61, interview: 33 },
  { name: "Rakesh Kumar Singh", gender: "M", category: "GEN", pct: 52, status: "REJECTED", note: "LL.M. below 55%" },
  { name: "Neha Gupta", gender: "F", category: "GEN", pct: 63, status: "DRAFT", note: "never submitted" },
];
const FIRST_F = ["Ankita", "Barnali", "Dipanwita", "Gitanjali", "Ishita", "Jyotsna", "Mitali", "Pallavi", "Rashmi", "Swati", "Trishna", "Upasana"];
const FIRST_M = ["Abhijit", "Biswajit", "Debasish", "Hiranya", "Jayanta", "Manash", "Nilotpal", "Partha", "Rajib", "Sanjib", "Tapan", "Utpal"];
const LAST = ["Baishya", "Bhattacharjee", "Borah", "Chakraborty", "Dutta", "Gogoi", "Kalita", "Konwar", "Nath", "Pathak", "Rabha", "Sonowal", "Talukdar", "Thakuria"];
const CATS = ["GEN", "GEN", "GEN", "OBC", "GEN", "OBC", "SC", "ST", "GEN", "EWS", "OBC", "GEN", "EWS"];
const UNIVS = ["NLUJA, Assam", "Gauhati University", "Dibrugarh University", "NEHU, Shillong", "National Law School of India University", "University of Delhi", "Tezpur University"];

export async function seedAdmissions(users: Record<string, string>, passwordHash: string) {
  const r = rng(20260816);
  const phd = await db.programme.findUniqueOrThrow({ where: { code: "PHD" } });
  await db.curriculumVersion.create({
    data: { programmeId: phd.id, code: "PHD-CUR-2022", name: "Ph.D. Coursework — UGC Regulations 2022", effectiveFrom: 2022, creditsPerCourse: 4, totalCredits: 16, notes: "Research Methodology, Research & Publication Ethics, two subject papers (16 credits)." },
  });
  const cycle = await db.admissionCycle.create({
    data: {
      code: "PHD-2026", name: "Ph.D. Admissions 2026-27", programmeId: phd.id, academicYear: "2026-27", status: "EVALUATION",
      opensAt: new Date("2026-08-16T03:30:00Z"), closesAt: new Date("2026-10-15T18:29:59Z"), applicationFee: 2000, admissionFee: 45000,
      seatMatrix: { UR: 5, OBC: 2, SC: 1, ST: 1, EWS: 1 }, requiredDocs: DOCS as unknown as Prisma.InputJsonValue, meritRule: RULE as unknown as Prisma.InputJsonValue,
    },
  });

  const generated: Seed[] = Array.from({ length: 25 }, (_, i) => {
    const gender = i % 2 ? "M" : "F";
    const name = `${(gender === "F" ? FIRST_F : FIRST_M)[Math.floor(i / 2) % 12]} ${LAST[(i * 5) % LAST.length]}`;
    const test = Math.round(36 + r() * 46);
    return { name, gender, category: CATS[i % CATS.length], pct: Math.round((55.5 + r() * 14) * 2) / 2, test, interview: Math.round((22 + r() * 24) * 2) / 2, pwd: i === 8, net: r() < 0.25 };
  });

  for (const [i, s] of [...KEY, ...generated].entries()) {
    const status = s.status ?? "VERIFIED";
    const relaxed = s.category !== "GEN" || s.pwd;
    const qualified = s.test != null && s.test >= (relaxed ? 45 : 50);
    const marks: Record<string, number> = {};
    if (status !== "DRAFT" && status !== "REJECTED" && s.test != null) {
      marks.TEST = s.test;
      if (qualified && s.interview != null) marks.INTERVIEW = s.interview;
    }
    const [first, ...rest] = s.name.toLowerCase().split(" ");
    const email = `${first}.${rest.at(-1)}${i}@example.com`;
    const user = s.name === "Priya Bora"
      ? await db.user.create({ data: { name: s.name, email: "priya.bora@example.com", role: "APPLICANT", designation: "Ph.D. applicant 2026-27", passwordHash } })
      : null;
    const submitted = status !== "DRAFT";
    const app = await db.application.create({
      data: {
        cycleId: cycle.id, appNo: `NLUJA/PHD/2026/${String(i + 1).padStart(4, "0")}`, userId: user?.id, name: s.name, gender: s.gender,
        dob: new Date(Date.UTC(1990 + Math.floor(r() * 9), Math.floor(r() * 12), 1 + Math.floor(r() * 27))), email: user?.email ?? email,
        phone: `9${String(Math.floor(r() * 1e9)).padStart(9, "0")}`, category: s.category, pwd: !!s.pwd, domicile: r() < 0.7 ? "Assam" : ["Meghalaya", "Mizoram", "West Bengal", "Manipur"][i % 4],
        address: `${1 + (i % 40)}, ${["Zoo Road", "Beltola", "Chandmari", "Uzan Bazar", "Dispur"][i % 5]}, Guwahati`, parentName: `${["Mr.", "Mrs."][i % 2]} ${rest.at(-1)![0].toUpperCase()}${rest.at(-1)!.slice(1)}`,
        qualifyingDegree: "LL.M.", qualifyingUniv: UNIVS[i % UNIVS.length], qualifyingYear: 2020 + (i % 6), qualifyingPct: s.pct, netQualified: !!s.net,
        researchArea: ["Constitutional and Administrative Law", "Criminal Law and Criminology", "Intellectual Property Law", "Environmental Law", "International Law and Human Rights", "Corporate and Commercial Law"][i % 6],
        proposalTitle: s.name === "Priya Bora" ? "Customary land rights of the Bodo community under the Sixth Schedule: a socio-legal study" : null,
        status, remarks: status === "REJECTED" ? "Ineligible: LL.M. 52% is below the 55% minimum for the General category (UGC Regulations 2022, cl. 3.1)." : null,
        feeRef: submitted ? `PAY${(0x5a3e00 + i * 977).toString(16).toUpperCase()}` : null, submittedAt: submitted ? new Date(Date.UTC(2026, 8, 1 + (i % 40))) : null,
        verifiedAt: status === "VERIFIED" ? new Date(Date.UTC(2026, 9, 20 + (i % 8))) : null,
        marks: Object.keys(marks).length ? marks : undefined, composite: compositeOf(marks, RULE),
      },
    });
    if (status === "DRAFT") continue;
    const specs = docsFor(DOCS, { category: s.category, pwd: !!s.pwd });
    await db.applicationDocument.createMany({
      data: specs.map((d) => {
        const rejected = s.name === "Priya Bora" && d.code === "CATEGORY";
        return {
          applicationId: app.id, code: d.code, fileName: d.code === "PHOTO" ? "photo.jpg" : `${d.code.toLowerCase()}.pdf`, mime: d.code === "PHOTO" ? "image/jpeg" : "application/pdf",
          size: 80_000 + Math.floor(r() * 900_000), uploadedAt: app.submittedAt!,
          status: status === "SUBMITTED" ? "PENDING" : rejected ? "REJECTED" : "ACCEPTED",
          remark: rejected ? "OBC-NCL certificate dated 12 Feb 2025 is not valid for 2026-27; upload a certificate issued on or after 1 April 2026." : null,
          verifiedById: status === "SUBMITTED" ? null : users.academic, verifiedAt: status === "SUBMITTED" ? null : new Date(Date.UTC(2026, 9, 18)),
        };
      }),
    });
  }

  // Profile corrections
  const sneha = await db.student.findFirstOrThrow({ where: { name: "Sneha Iyer" } });
  await db.profileChangeRequest.create({
    data: { studentId: sneha.id, field: "name", oldValue: "Sneha Iyer", newValue: "Sneha Ramachandran Iyer", reason: "My Class X CBSE certificate reads 'Sneha Ramachandran Iyer'; the University record omits my middle name. Attested copy submitted to the Academic Section.", createdAt: new Date("2026-11-03T06:10:00Z") },
  });
  const arindam = await db.student.findFirstOrThrow({ where: { name: "Arindam Hazarika" } });
  await db.student.update({ where: { id: arindam.id }, data: { parentName: "Mr. Bhaskar Jyoti Hazarika" } });
  await db.profileChangeRequest.create({
    data: {
      studentId: arindam.id, field: "parentName", oldValue: arindam.parentName, newValue: "Mr. Bhaskar Jyoti Hazarika", reason: "Father's full name as per Class X admit card and Aadhaar.", status: "APPROVED",
      decidedById: users.academic, decidedAt: new Date("2026-09-12T08:00:00Z"), createdAt: new Date("2026-09-10T05:00:00Z"),
    },
  });
}
