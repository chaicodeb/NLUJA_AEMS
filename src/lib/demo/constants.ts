export const DEMO_OTP = "246810";
/** This student registers live during the demo, so bulk registration leaves her out. */
export const LIVE_STUDENT_EMAIL = "student@nluassam.ac.in";
/** Marks sheet the teacher completes live: these students' marks are still blank at "Fresh start". */
export const DEMO_MARKS_SHEET = { course: "BL3.5", component: "PROJ", pending: { "BAL25-004": 14, "BAL25-008": 12.5 } as Record<string, number> };
/** Marks sheet already submitted by its teacher, awaiting the Dean's verification. */
export const DEMO_VERIFY_SHEET = { course: "BL3.6", component: "MID" };
