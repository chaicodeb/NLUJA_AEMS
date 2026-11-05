export type Question = { id: string; section: string; text: string; kind: "LIKERT" | "TEXT"; required: boolean };
export type Answers = Record<string, number | string>;

export const LIKERT = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

export const COURSE_TEMPLATE: Question[] = [
  { id: "q1", section: "Course", kind: "LIKERT", required: true, text: "The course objectives and learning outcomes were made clear at the start" },
  { id: "q2", section: "Course", kind: "LIKERT", required: true, text: "The prescribed syllabus was covered adequately" },
  { id: "q3", section: "Course", kind: "LIKERT", required: true, text: "Reading materials, case law and resources provided were useful" },
  { id: "q4", section: "Teaching", kind: "LIKERT", required: true, text: "The teacher was well prepared for every class" },
  { id: "q5", section: "Teaching", kind: "LIKERT", required: true, text: "Concepts were explained clearly, with judgments and practical examples" },
  { id: "q6", section: "Teaching", kind: "LIKERT", required: true, text: "The teacher encouraged discussion, questions and critical thinking" },
  { id: "q7", section: "Teaching", kind: "LIKERT", required: true, text: "The teacher was punctual and available for consultation" },
  { id: "q8", section: "Assessment", kind: "LIKERT", required: true, text: "Internal assessment was fair, and work was returned with useful feedback" },
  { id: "c1", section: "Comments", kind: "TEXT", required: false, text: "What did you value most in this course?" },
  { id: "c2", section: "Comments", kind: "TEXT", required: false, text: "What should be improved?" },
];

export const INSTITUTION_TEMPLATE: Question[] = [
  { id: "s1", section: "Teaching–learning", kind: "LIKERT", required: true, text: "The curriculum prepares me for practice, judicial service and research" },
  { id: "s2", section: "Teaching–learning", kind: "LIKERT", required: true, text: "Moot court, legal aid clinic and internship opportunities are adequate" },
  { id: "s3", section: "Resources", kind: "LIKERT", required: true, text: "The library and legal databases (SCC Online, Manupatra, HeinOnline) meet my needs" },
  { id: "s4", section: "Resources", kind: "LIKERT", required: true, text: "Campus Wi-Fi and IT facilities are reliable" },
  { id: "s5", section: "Campus life", kind: "LIKERT", required: true, text: "Hostel and mess facilities are satisfactory" },
  { id: "s6", section: "Support", kind: "LIKERT", required: true, text: "Grievances are heard and resolved fairly and on time" },
  { id: "s7", section: "Support", kind: "LIKERT", required: true, text: "Career guidance and placement support are effective" },
  { id: "s8", section: "Examinations", kind: "LIKERT", required: true, text: "The examination system is transparent and results are declared on time" },
  { id: "s9", section: "Overall", kind: "LIKERT", required: true, text: "Overall, I am satisfied with my experience at the University" },
  { id: "c1", section: "Comments", kind: "TEXT", required: false, text: "Any suggestion for the University?" },
];

export const EXIT_TEMPLATE: Question[] = [
  { id: "e1", section: "Programme outcomes", kind: "LIKERT", required: true, text: "The programme developed my legal reasoning, research and writing skills" },
  { id: "e2", section: "Programme outcomes", kind: "LIKERT", required: true, text: "Clinical courses, moots and internships prepared me for professional practice" },
  { id: "e3", section: "Programme outcomes", kind: "LIKERT", required: true, text: "The curriculum was current with developments in law and society" },
  { id: "e4", section: "Support", kind: "LIKERT", required: true, text: "Placement and career support helped me secure my next step" },
  { id: "e5", section: "Support", kind: "LIKERT", required: true, text: "Administrative services (examinations, records, certificates) were efficient" },
  { id: "e6", section: "Overall", kind: "LIKERT", required: true, text: "I would recommend NLUJA, Assam to a prospective law student" },
  { id: "c1", section: "Comments", kind: "TEXT", required: false, text: "What should the University change for future batches?" },
];

export type Summary = {
  n: number;
  index: number | null;
  perQuestion: { id: string; section: string; text: string; mean: number | null; dist: number[] }[];
  comments: { question: string; text: string }[];
};

export function summarise(responses: { answers: unknown }[], questions: Question[]): Summary {
  const rows = responses.map((r) => r.answers as Answers);
  const perQuestion = questions
    .filter((q) => q.kind === "LIKERT")
    .map((q) => {
      const vals = rows.map((a) => a[q.id]).filter((v): v is number => typeof v === "number");
      const dist = [1, 2, 3, 4, 5].map((v) => vals.filter((x) => x === v).length);
      return { id: q.id, section: q.section, text: q.text, mean: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null, dist };
    });
  const means = perQuestion.map((q) => q.mean).filter((m): m is number => m != null);
  const comments = questions
    .filter((q) => q.kind === "TEXT")
    .flatMap((q) => rows.map((a) => a[q.id]).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((text) => ({ question: q.text, text })));
  return { n: rows.length, index: means.length ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100 : null, perQuestion, comments };
}

export function bandFor(index: number | null): { label: string; tone: "green" | "blue" | "amber" | "red" | "neutral" } {
  if (index == null) return { label: "No data", tone: "neutral" };
  if (index >= 4.2) return { label: "Excellent", tone: "green" };
  if (index >= 3.6) return { label: "Good", tone: "blue" };
  if (index >= 3.0) return { label: "Needs attention", tone: "amber" };
  return { label: "Concern", tone: "red" };
}
