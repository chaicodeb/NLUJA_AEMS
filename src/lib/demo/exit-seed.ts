import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { EXIT_TEMPLATE, type Answers } from "../feedback/shared";
import { issueExitCertificates, processRefund, saveBankDetails } from "../exit/exit";
import { rng } from "./scenarios";

const FIRST = ["Aarav", "Anushka", "Bhargav", "Chandana", "Debashree", "Farhan", "Gargi", "Himangshu", "Ishani", "Jyotishman", "Kasturi", "Lakshya", "Madhurima", "Nayan", "Oindrila", "Pallab", "Rimjhim", "Sagarika", "Tridib", "Upasana", "Vaibhav", "Yashashree", "Zubeen", "Arunima"];
const LAST = ["Baruah", "Bordoloi", "Choudhury", "Das", "Deka", "Goswami", "Hazarika", "Kakoti", "Mahanta", "Nath", "Phukan", "Saikia", "Sarma", "Talukdar", "Medhi", "Rahman"];
const PROFILES: Record<string, { orgs: string[]; titles: string[] }> = {
  LITIGATION: { orgs: ["Gauhati High Court", "Supreme Court of India", "Delhi High Court", "District & Sessions Court, Kamrup (M)"], titles: ["Advocate", "Advocate-on-Record", "Associate Counsel"] },
  LAW_FIRM: { orgs: ["Corporate law firm, Mumbai", "Full-service law firm, New Delhi", "Disputes practice, Bengaluru", "Boutique IP firm, Gurugram"], titles: ["Associate", "Senior Associate", "Principal Associate"] },
  CORPORATE: { orgs: ["Public-sector oil company, Guwahati", "Private bank, Mumbai", "Technology company, Bengaluru", "Tea plantation group, Kolkata"], titles: ["Legal Manager", "Legal Counsel", "Compliance Officer"] },
  JUDICIARY: { orgs: ["Assam Judicial Service", "Meghalaya Judicial Service", "Arunachal Pradesh Judicial Service"], titles: ["Civil Judge (Junior Division)", "Judicial Magistrate First Class"] },
  CIVIL_SERVICES: { orgs: ["Indian Administrative Service", "Assam Civil Service", "Indian Revenue Service"], titles: ["Officer Trainee", "Assistant Commissioner", "Extra Assistant Commissioner"] },
  ACADEMIA: { orgs: ["National law university (faculty)", "Central university, North-East", "Law school, Pune"], titles: ["Assistant Professor", "Research Fellow"] },
  POLICY_NGO: { orgs: ["Legal-aid NGO, Guwahati", "Policy think-tank, New Delhi", "UN agency, Geneva"], titles: ["Legal Officer", "Policy Analyst", "Programme Associate"] },
  HIGHER_STUDIES: { orgs: ["LL.M., University of Cambridge", "LL.M., National Law School of India University", "Ph.D., NLUJA Assam", "LL.M., University College London"], titles: ["Student"] },
  SEEKING: { orgs: [""], titles: [""] },
};
const CITIES = ["Guwahati", "New Delhi", "Mumbai", "Bengaluru", "Shillong", "Kolkata", "Dibrugarh", "London"];
const WEIGHTS: [string, number][] = [["LITIGATION", 24], ["LAW_FIRM", 22], ["CORPORATE", 14], ["JUDICIARY", 12], ["HIGHER_STUDIES", 12], ["ACADEMIA", 5], ["CIVIL_SERVICES", 4], ["POLICY_NGO", 4], ["SEEKING", 7]];

export async function seedExitAndAlumni(users: Record<string, string>) {
  const r = rng(20140701);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const sector = () => {
    let x = r() * WEIGHTS.reduce((a, [, w]) => a + w, 0);
    for (const [s, w] of WEIGHTS) if ((x -= w) < 0) return s;
    return "LITIGATION";
  };

  // Migrated alumni registry: first graduating batch 2014 onwards
  const migrated: Prisma.AlumniProfileCreateManyInput[] = [];
  for (let year = 2014; year <= 2025; year++) {
    for (let k = 0; k < 4; k++) {
      const s = sector();
      const p = PROFILES[s];
      const i = migrated.length;
      const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
      migrated.push({
        name, programme: k === 3 && year >= 2018 ? "LLM" : "BALLB", graduationYear: year,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${year}@alumni.nluassam.ac.in`, sector: s,
        organisation: pick(p.orgs) || null, designation: pick(p.titles) || null, city: s === "SEEKING" ? "Guwahati" : pick(CITIES),
        qualifiedExams: s === "JUDICIARY" ? ["Judicial Services"] : s === "ACADEMIA" ? ["UGC-NET"] : s === "CIVIL_SERVICES" ? ["Civil Services"] : r() < 0.5 ? ["AIBE"] : [],
        directoryConsent: r() < 0.85, mentor: r() < 0.25, source: "MIGRATED",
      });
    }
  }
  await db.alumniProfile.createMany({ data: migrated });

  // Graduate exit survey for the 2021–26 batch
  const form = await db.feedbackForm.create({
    data: {
      title: "Graduate Exit Survey 2026", type: "EXIT", academicYear: "2025-26", status: "OPEN", opensAt: new Date("2026-07-01T03:30:00Z"), closesAt: new Date("2027-01-31T18:29:59Z"),
      minResponses: 5, createdById: users.iqac, questions: EXIT_TEMPLATE as unknown as Prisma.InputJsonValue,
      description: "Anonymous survey of graduating students on programme outcomes and support services (NAAC criterion 2.7 / 5.2).",
    },
  });

  const grads = await db.student.findMany({ where: { batch: { code: "BALLB-2021" } }, orderBy: { rollNo: "asc" } });
  const completed = ["Kunal Sarma", "Ankita Dutta", "Rohan Agarwala", "Jahnabi Kalita", "Tanya Bora"];
  const surveyed = [...completed, "Mrinal Deka", "Sahil Ahmed"];
  const comments = ["More practitioners in clinical courses, please.", "Placement cell should start in the fourth year.", "Library database access from hostels would help.", "Excellent moot court culture — keep it."];
  for (const g of grads) {
    if (g.name === "Bikram Chetri") continue;
    await db.exitRequest.create({ data: { studentId: g.id, type: "GRADUATION", createdAt: new Date("2026-07-02T05:00:00Z") } });
    if (surveyed.includes(g.name)) {
      const answers: Answers = {};
      for (const q of EXIT_TEMPLATE) {
        if (q.kind === "LIKERT") answers[q.id] = Math.max(2, Math.min(5, Math.round(4 + (r() - 0.5) * 2 - (q.id === "e4" ? 0.6 : 0))));
        else if (r() < 0.6) answers[q.id] = pick(comments);
      }
      const on = new Date(Date.UTC(2026, 6, 5 + Math.floor(r() * 20)));
      await db.feedbackSubmission.create({ data: { formId: form.id, studentId: g.id, courseId: "", submittedOn: on } });
      await db.feedbackResponse.create({ data: { formId: form.id, courseId: "", batchId: g.batchId, answers: answers as Prisma.InputJsonValue, submittedOn: on } });
    }
    if (completed.includes(g.name)) {
      const user = { id: users.admin, role: "ADMIN" };
      await saveBankDetails(g.id, `3${String(1000000000 + grads.indexOf(g) * 7919)}`, "SBIN0001234", user);
      await processRefund(g.id, { id: users.accounts, role: "ACCOUNTS" });
      await issueExitCertificates(g.id, { id: users.registrar, role: "REGISTRAR" });
      const s = pick(["LAW_FIRM", "LITIGATION", "JUDICIARY", "HIGHER_STUDIES", "CORPORATE"]);
      await db.alumniProfile.create({
        data: {
          studentId: g.id, name: g.name, programme: "BALLB", graduationYear: 2026, email: g.email, sector: s, organisation: pick(PROFILES[s].orgs), designation: pick(PROFILES[s].titles),
          city: pick(CITIES.slice(0, 6)), qualifiedExams: s === "JUDICIARY" ? ["Judicial Services", "AIBE"] : ["AIBE"], source: "SELF", mentor: false,
        },
      });
    }
  }

  // Mid-programme withdrawal waiting at the departmental desks
  const leaver = await db.student.findUniqueOrThrow({ where: { rollNo: "BAL25-010" } });
  await db.exitRequest.create({
    data: {
      studentId: leaver.id, type: "WITHDRAWAL", reason: "Family relocating to Canada; withdrawing from the programme after Semester III.",
      forwardingAddress: "House 12, Rajgarh Road, Guwahati 781003", bankAccount: "30219876543", ifsc: "SBIN0001234", createdAt: new Date("2026-11-02T05:00:00Z"),
    },
  });
  await db.clearance.createMany({
    data: [
      { studentId: leaver.id, department: "LIBRARY", status: "PENDING" },
      { studentId: leaver.id, department: "HOSTEL", status: "PENDING" },
      { studentId: leaver.id, department: "ACCOUNTS", status: "PENDING" },
      { studentId: leaver.id, department: "EXAMINATION", status: "CLEARED", note: "No pending examination fee or records", updatedById: users.exam },
    ],
  });
}
