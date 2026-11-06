import { db } from "../db";
import { audit } from "../audit";
import { encryptContent, hashContent } from "../exams/question-paper";
import type { QPContent } from "../exams/question-paper-checks";

const INSTRUCTIONS = "Answer all questions. Each question has an internal choice — attempt either (a) or (b). Figures in the right margin indicate full marks. Unannotated bare acts are permitted.";
const q = (no: string, unit: string, marks: number, text: string, orText?: string) => ({ no, unit, marks, text, ...(orText !== undefined ? { orText } : {}) });

/** BL9.1 — sealed: set, moderated and sealed; ready for release on the day. */
const HUMAN_RIGHTS: QPContent = {
  instructions: INSTRUCTIONS,
  questions: [
    q("Q1", "I", 14, "Trace the evolution of human rights from natural-rights theory to the Universal Declaration of Human Rights, 1948. Is the distinction between 'first' and 'second' generation rights still meaningful?",
      "Critically examine the universalism versus cultural relativism debate with reference to the Vienna Declaration and Programme of Action, 1993."),
    q("Q2", "II", 14, "Discuss the mandate of the Human Rights Council and its Universal Periodic Review. How effective has the UPR been in improving India's human rights record?",
      "Examine the role of treaty bodies under the ICCPR and ICESCR. Should India accept the individual complaints procedure under the First Optional Protocol to the ICCPR?"),
    q("Q3", "III", 14, "'Article 21 has become the repository of unenumerated human rights in India.' Discuss with reference to Maneka Gandhi v. Union of India and K.S. Puttaswamy v. Union of India.",
      "Analyse the constitutional and statutory safeguards for persons in custody, with reference to D.K. Basu v. State of West Bengal."),
    q("Q4", "IV", 14, "Evaluate the powers and functioning of the National Human Rights Commission under the Protection of Human Rights Act, 1993. Has the 2019 amendment strengthened its independence?",
      "Write a critical note on the Rights of Persons with Disabilities Act, 2016 as an instrument implementing the UN Convention on the Rights of Persons with Disabilities."),
    q("Q5", "V", 14, "Problem: A tribal community in Assam is displaced by a hydro-electric project without consultation or rehabilitation. Advise the community on the remedies available under domestic law and international human rights law.",
      "Problem: A journalist is detained under a preventive detention law for social-media posts criticising the State. Examine the legality of the detention in light of Articles 19, 21 and 22 and India's obligations under the ICCPR."),
  ],
};

/** BL9.2 — submitted, awaiting the moderator; passes every blocking check but leaves Unit IV unexamined. */
const TAXATION: QPContent = {
  instructions: INSTRUCTIONS,
  questions: [
    q("Q1", "I", 14, "Explain the concept of 'income' under the Income-tax Act, 1961. Distinguish between capital receipts and revenue receipts with the help of decided cases.",
      "Discuss the rules for determining the residential status of an individual. How does residential status affect the scope of total income?"),
    q("Q2", "II", 14, "Examine the deductions under Chapter VI-A with particular reference to Sections 80C and 80D. Are they consistent with the objectives of the new tax regime under Section 115BAC?",
      "Explain the provisions relating to the set-off and carry forward of losses under the Income-tax Act, 1961."),
    q("Q3", "III", 14, "Explain the concept of 'supply' under the Central Goods and Services Tax Act, 2017, including composite and mixed supplies.",
      "Discuss the mechanism of input tax credit under GST and the conditions for availing it under Section 16 of the CGST Act."),
    q("Q4", "III", 14, "Critically examine the place-of-supply rules for inter-State supplies of services under the IGST Act, 2017.",
      "Write a note on the constitutional basis of GST after the 101st Amendment and the role of the GST Council, with reference to Union of India v. Mohit Minerals."),
    q("Q5", "V", 14, "Problem: X Ltd., a Guwahati-based company, sells software subscriptions to customers in Bhutan and Bangladesh. Advise X Ltd. on the GST treatment of these supplies as exports of services.",
      "Problem: A non-resident Indian receives rent from a flat in Kolkata and interest on an NRO account. Identify the heads of income involved and advise on tax deduction at source."),
  ],
};

/** BL9.3 — still a draft: adds up to 66 instead of 70, Unit V missing and Q4 (b) not yet written. */
const ADR: QPContent = {
  instructions: INSTRUCTIONS,
  questions: [
    q("Q1", "I", 14, "Discuss the advantages of alternative dispute resolution over litigation. How does Section 89 of the Code of Civil Procedure, 1908 promote ADR, in light of Afcons Infrastructure v. Cherian Varkey Construction?",
      "Explain the essential elements of a valid arbitration agreement under Section 7 of the Arbitration and Conciliation Act, 1996."),
    q("Q2", "II", 14, "Examine the grounds for setting aside an arbitral award under Section 34 of the Arbitration and Conciliation Act, 1996, with particular reference to the 'public policy of India'.",
      "Discuss the competence-competence principle under Section 16 of the Act and the scope of judicial intervention at the referral stage."),
    q("Q3", "III", 14, "Explain the process of conciliation under Part III of the Arbitration and Conciliation Act, 1996. How does it differ from mediation?",
      "Critically analyse the Mediation Act, 2023. Will mandatory pre-litigation mediation reduce the pendency of commercial disputes?"),
    q("Q4", "IV", 14, "Discuss the enforcement of foreign arbitral awards under the New York Convention as incorporated in Part II of the Arbitration and Conciliation Act, 1996.", ""),
    q("Q5", "IV", 10, "Problem: Parties to a construction contract in Guwahati agree to arbitration seated in Singapore. One party seeks interim relief from the Gauhati High Court. Advise on the availability of relief under Section 9."),
  ],
};

/** BL9.4 — returned by the moderator: Q2 (a) and Q4 (a) ask the same thing. */
const COMPARATIVE: QPContent = {
  instructions: INSTRUCTIONS,
  questions: [
    q("Q1", "I", 14, "What is the purpose of comparative constitutional law? Discuss the functionalist and contextualist methods of comparison.",
      "Examine the idea of constitutional borrowing with reference to the Indian Constitution's debt to the Government of India Act, 1935 and the Irish Constitution."),
    q("Q2", "II", 14, "Compare the doctrine of judicial review in the United States and India, with reference to Marbury v. Madison and Kesavananda Bharati v. State of Kerala.",
      "Compare the parliamentary system of the United Kingdom with the presidential system of the United States. Which features did India adopt, and why?"),
    q("Q3", "III", 14, "Discuss federalism in Canada, Australia and India. Is India rightly described as 'quasi-federal'?",
      "Compare the emergency provisions of the Indian Constitution with Article 48 of the Weimar Constitution."),
    q("Q4", "IV", 14, "Compare judicial review in India and the United States with reference to Marbury v. Madison and Kesavananda Bharati v. State of Kerala, and the basic structure doctrine.",
      "Discuss the proportionality test in constitutional adjudication in Germany, Canada and India."),
    q("Q5", "V", 14, "Problem: A country proposes to amend its constitution to extend the term of its legislature. Advise on the validity of the amendment from a comparative perspective.",
      "Problem: A State enacts a law restricting religious attire in public institutions. Compare how courts in France and India would assess its validity."),
  ],
};

export async function seedQuestionPapers(users: Record<string, string>, examId: string) {
  const papers = await db.examPaper.findMany({ where: { examId, course: { code: { in: ["BL9.1", "BL9.2", "BL9.3", "BL9.4"] } } }, include: { course: true } });
  const by = (code: string) => papers.find((p) => p.course.code === code)!;
  const hod = { id: users.hod, role: "HOD", name: "Prof. N. Goswami" };
  const make = async (code: string, content: QPContent, data: Record<string, unknown>) => {
    const p = by(code);
    const qp = await db.questionPaper.create({ data: { examPaperId: p.id, body: encryptContent(content), contentHash: hashContent(content), ...data } });
    await audit({ actorId: p.setterId, actorRole: "FACULTY", action: "QP_STARTED", entity: "QuestionPaper", entityId: qp.id, summary: `${code} question paper drafting started by the setter` });
    return { p, qp };
  };
  const submitted = async (code: string, id: string, setterId: string | null) =>
    audit({ actorId: setterId, actorRole: "FACULTY", action: "QP_SUBMITTED", entity: "QuestionPaper", entityId: id, summary: `${code} question paper version 1 submitted for moderation` });

  const hr = await make("BL9.1", HUMAN_RIGHTS, { status: "SEALED", moderatorId: hod.id, moderatorName: hod.name, moderatorNote: "Balanced across all five units; problem questions are well framed.", submittedAt: new Date("2026-10-28T06:00:00Z"), moderatedAt: new Date("2026-10-30T09:00:00Z"), sealedAt: new Date("2026-11-02T05:30:00Z") });
  await submitted("BL9.1", hr.qp.id, hr.p.setterId);
  await audit({ actorId: hod.id, actorRole: "HOD", action: "QP_MODERATED", entity: "QuestionPaper", entityId: hr.qp.id, summary: "BL9.1 question paper version 1 approved by the moderator — Balanced across all five units; problem questions are well framed." });
  await audit({ actorId: users.coe, actorRole: "COE", action: "QP_SEALED", entity: "QuestionPaper", entityId: hr.qp.id, summary: `BL9.1 question paper sealed — fingerprint ${hr.qp.contentHash.slice(0, 16)}; locked until release one hour before the paper`, after: { status: "SEALED", contentHash: hr.qp.contentHash } });

  const tax = await make("BL9.2", TAXATION, { status: "SUBMITTED", submittedAt: new Date("2026-11-03T07:15:00Z") });
  await submitted("BL9.2", tax.qp.id, tax.p.setterId);

  await make("BL9.3", ADR, { status: "DRAFT" });

  const comp = await make("BL9.4", COMPARATIVE, {
    status: "CHANGES_REQUESTED", moderatorId: hod.id, moderatorName: hod.name, submittedAt: new Date("2026-11-01T06:00:00Z"), moderatedAt: new Date("2026-11-04T10:00:00Z"),
    moderatorNote: "Q2 (a) and Q4 (a) both ask about judicial review in the US and India — replace one of them. Otherwise well balanced.",
  });
  await submitted("BL9.4", comp.qp.id, comp.p.setterId);
  await audit({ actorId: hod.id, actorRole: "HOD", action: "QP_CHANGES_REQUESTED", entity: "QuestionPaper", entityId: comp.qp.id, summary: "BL9.4 question paper returned to the setter — Q2 (a) and Q4 (a) both ask about judicial review in the US and India — replace one of them." });
}
