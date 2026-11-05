export const DEMO_OTP = "246810";
/** This student registers live during the demo, so bulk registration leaves her out. */
export const LIVE_STUDENT_EMAIL = "student@nluassam.ac.in";
/** Marks sheet the teacher completes live: these students' marks are still blank at "Fresh start". */
export const DEMO_MARKS_SHEET = { course: "BL3.5", component: "PROJ", pending: { "BAL25-004": 14, "BAL25-008": 12.5 } as Record<string, number> };
/** Marks sheet already submitted by its teacher, awaiting the Dean's verification. */
export const DEMO_VERIFY_SHEET = { course: "BL3.6", component: "MID" };
/** Last class of the semester, marked live: Rahul's absence takes him from 36/51 (70.6%) to 36/52 (69.2%). */
export const DEMO_LIVE_CLASS = { course: "BL9.2", absent: ["BAL22-002", "BAL22-011"] };
/** A paper set harder than intended: its end-semester marks come out low and it is flagged for the Moderation Board. */
export const DEMO_TOUGH_PAPER = { course: "BL3.4", factor: 0.65, delta: 2.5 };
/** Candidates already registered for the supplementary examination at that stage; Arindam registers live. Award-list marks used in the demo. */
export const DEMO_SUPPLEMENTARY = {
  preRegistered: [["Lalrinpuii Ralte", "BL9.4"], ["Sourav Singha", "BL9.2"]] as [string, string][],
  marks: { "BL9.4": { "Lalrinpuii Ralte": 52 }, "BL9.2": { "Sourav Singha": 45 }, "BL9.3": { "Arindam Hazarika": 38 } } as Record<string, Record<string, number>>,
};
/** Aditi has not yet given feedback for these courses (nor the satisfaction survey); BL3.4 attracts weak scores. */
export const DEMO_FEEDBACK = { roll: "BAL22-001", pendingCourses: ["BL9.4", "BL9.5"], lowCourse: "BL3.4" };
/** Leave applications: one approved medical leave (supports Priyanka's relaxation), one duty leave for the Dean to approve live. */
export const DEMO_LEAVES = [
  { roll: "BAL22-003", type: "MEDICAL", from: "2026-09-14", to: "2026-09-18", status: "APPROVED", reason: "Hospitalised with dengue at GMCH, 12–19 September 2026", document: "GMCH_discharge_summary.pdf" },
  { roll: "BAL22-010", type: "DUTY", from: "2026-10-08", to: "2026-10-09", status: "PENDING", reason: "Represented the University at the Surana & Surana National Moot Court Competition, Bengaluru", document: "Moot_participation_certificate.pdf" },
] as const;
