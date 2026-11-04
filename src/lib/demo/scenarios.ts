/**
 * Demo storyline: specific students are planted to trigger each rule the RFP
 * asks us to prove (attendance relaxation, grace marks, component-wise pass, absence).
 */

export type StudentSeed = {
  name: string;
  gender: "F" | "M";
  ability: number; // 0..1, drives generated marks
  attendance?: Record<string, number>; // course code -> classes attended (of CLASSES_HELD)
  baseAttendance?: number; // default % for courses not listed
  internals?: Record<string, Record<string, number>>; // course code -> component code -> marks
  end?: Record<string, number | "AB">; // course code -> end-sem / written marks (applied at exam simulation)
  note?: string;
};

export const CLASSES_HELD = 52;

export const BALLB_2022: StudentSeed[] = [
  { name: "Aditi Baruah", gender: "F", ability: 0.86, baseAttendance: 92, note: "Demo student login — consistent high performer" },
  { name: "Rahul Kalita", gender: "M", ability: 0.7, baseAttendance: 88, attendance: { "BL9.2": 36 }, note: "69.2% in Taxation → ineligible (relaxable, no request filed)" },
  { name: "Priyanka Saikia", gender: "F", ability: 0.74, baseAttendance: 80, attendance: { "BL9.3": 35 }, note: "67.3% in ADR, aggregate ≥70% → VC relaxation request pending" },
  { name: "Imtiaz Hussain", gender: "M", ability: 0.68, baseAttendance: 86, attendance: { "BL9.1": 33 }, note: "63.5% in Human Rights → ineligible, below relaxation floor" },
  { name: "Neha Das", gender: "F", ability: 0.66, baseAttendance: 72, attendance: { "BL9.4": 34, "BL9.2": 36 }, note: "65.4% / 69.2% shortfalls, aggregate 69.6% (<70%) → not relaxable" },
  {
    name: "Sourav Singha", gender: "M", ability: 0.58, baseAttendance: 84,
    internals: { "BL9.2": { MID: 14 } }, end: { "BL9.2": 34 },
    note: "48/100 in Taxation → 2 grace marks → pass (grace flagged)",
  },
  { name: "Lalrinpuii Ralte", gender: "F", ability: 0.77, baseAttendance: 90, end: { "BL9.4": "AB" }, note: "Absent in Hons. V end-semester → AB" },
  {
    name: "Arindam Hazarika", gender: "M", ability: 0.55, baseAttendance: 82,
    internals: { "BL9.3": { MID: 12 } }, end: { "BL9.3": 29 },
    note: "41/100 in ADR → fail beyond grace limit",
  },
  { name: "Tenzing Bhutia", gender: "M", ability: 0.72, baseAttendance: 87 },
  { name: "Moumita Gogoi", gender: "F", ability: 0.81, baseAttendance: 91 },
  { name: "Akash Borah", gender: "M", ability: 0.63, baseAttendance: 79 },
  { name: "Sanjana Sangma", gender: "F", ability: 0.75, baseAttendance: 85 },
];

export const BALLB_2025: StudentSeed[] = [
  { name: "Ishita Choudhury", gender: "F", ability: 0.82, baseAttendance: 93 },
  { name: "Bhaskar Deka", gender: "M", ability: 0.69, baseAttendance: 86 },
  { name: "Meghna Phukan", gender: "F", ability: 0.77, baseAttendance: 89 },
  { name: "Nabajit Medhi", gender: "M", ability: 0.61, baseAttendance: 81 },
  { name: "Riya Talukdar", gender: "F", ability: 0.73, baseAttendance: 88 },
  { name: "Ayan Chakraborty", gender: "M", ability: 0.66, baseAttendance: 84 },
  { name: "Temsula Imchen", gender: "F", ability: 0.79, baseAttendance: 90 },
  { name: "Pranjal Nath", gender: "M", ability: 0.64, baseAttendance: 83 },
  { name: "Simran Kaur", gender: "F", ability: 0.71, baseAttendance: 87 },
  { name: "Debojit Mahanta", gender: "M", ability: 0.59, baseAttendance: 80 },
];

export const LLM_2026: StudentSeed[] = [
  { name: "Ananya Krishnan", gender: "F", ability: 0.83, baseAttendance: 92 },
  { name: "Karan Mehta", gender: "M", ability: 0.72, baseAttendance: 86, attendance: { "ML1.2": 38 }, note: "73.1% in ML1.2 → below LL.M. 75% threshold" },
  {
    name: "Sneha Iyer", gender: "F", ability: 0.7, baseAttendance: 88,
    internals: { "ML1.3": { SEMINAR: 18, VIVA: 9 } }, end: { "ML1.3": 32 },
    note: "59/100 aggregate but Written 32/70 (<35) → F on component rule",
  },
  {
    name: "Rohit Barman", gender: "M", ability: 0.74, baseAttendance: 89,
    internals: { "ML1.4": { SEMINAR: 9, VIVA: 7 } },
    note: "Seminar paper 9/20 (<10) → F on component rule despite aggregate pass",
  },
  { name: "Fatima Rahman", gender: "F", ability: 0.78, baseAttendance: 90 },
  { name: "Vikram Rao", gender: "M", ability: 0.65, baseAttendance: 85 },
  { name: "Pooja Agarwal", gender: "F", ability: 0.8, baseAttendance: 91 },
  { name: "Joseph Lalmuanpuia", gender: "M", ability: 0.69, baseAttendance: 87 },
];

/** Deterministic PRNG so every reset produces identical data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genMark(max: number, ability: number, r: () => number, spread = 0.12) {
  const v = ability + (r() - 0.5) * 2 * spread;
  return Math.max(0, Math.min(max, Math.round(max * Math.min(0.97, Math.max(0.3, v)))));
}

/** Attendance marks (out of 5) per B.A. LL.B. regulation. */
export function attendanceMarks(p: number) {
  if (p >= 95) return 5;
  if (p >= 90) return 4;
  if (p >= 85) return 3;
  if (p >= 80) return 2;
  if (p >= 75) return 1;
  return 0;
}

export const DEMO_PASSWORD = "Demo@123";
