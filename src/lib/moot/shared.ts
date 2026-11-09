export type Criterion = { code: string; name: string; max: number };

/** Oral criteria are the BL9.5 "Oral Argumentation" sub-criteria, so moot scores map straight onto internal marks. */
export const SPEAKER_CRITERIA: Criterion[] = [
  { code: "FACTS", name: "Understanding of facts", max: 5 },
  { code: "LAW", name: "Knowledge of law", max: 5 },
  { code: "LANG", name: "Command over language", max: 5 },
  { code: "DEMEANOUR", name: "Demeanour & court mannerism", max: 5 },
  { code: "RESPONSE", name: "Response to questions", max: 5 },
];
export const RESEARCHER_CRITERIA: Criterion[] = [
  { code: "RESEARCH", name: "Research support", max: 5 },
  { code: "ASSIST", name: "Assistance to counsel", max: 5 },
];
export const MEMORIAL_CRITERIA: Criterion[] = [
  { code: "ISSUES", name: "Identification of issues", max: 25 },
  { code: "AUTHORITIES", name: "Use of authorities", max: 25 },
  { code: "STRUCTURE", name: "Structure & citation", max: 25 },
  { code: "PERSUASION", name: "Persuasiveness", max: 25 },
];
export const ROLES: Record<string, string> = { SPEAKER_1: "Speaker 1", SPEAKER_2: "Speaker 2", RESEARCHER: "Researcher" };
export const COURTROOMS = ["Moot Court Hall 1", "Moot Court Hall 2", "Seminar Hall (mock trial)"];
export const STAGES: Record<string, string> = { PRELIMINARY: "Preliminary", SEMI_FINAL: "Semi-final", FINAL: "Final" };
export type Weights = { memorial: number; oral: number; researcher: number };

export const criteriaFor = (role: string) => (role === "RESEARCHER" ? RESEARCHER_CRITERIA : SPEAKER_CRITERIA);
export const maxFor = (role: string) => criteriaFor(role).reduce((a, c) => a + c.max, 0);
