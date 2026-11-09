export const UFM_CATEGORIES: Record<string, string> = {
  CHITS: "Possession of chits / notes",
  COPYING: "Copying from another candidate",
  DEVICE: "Mobile phone or electronic device",
  IMPERSONATION: "Impersonation",
  BOOKLET: "Tampering with the answer booklet",
  MISCONDUCT: "Misconduct in the examination hall",
  OTHER: "Other",
};

/** Penalties under the University's examination ordinance; the result engine applies the last column. */
export const UFM_PENALTIES: Record<string, { label: string; effect: string; result: "NONE" | "PAPER" | "EXAM" }> = {
  EXONERATED: { label: "Exonerated", effect: "No unfair means established — result released normally", result: "NONE" },
  WARNING: { label: "Written warning", effect: "Warning recorded on file — result released normally", result: "NONE" },
  CANCEL_PAPER: { label: "Paper cancelled", effect: "This paper is cancelled (grade F); the student may appear in the supplementary examination", result: "PAPER" },
  CANCEL_ALL: { label: "Whole examination cancelled", effect: "All papers of this examination are cancelled (grade F)", result: "EXAM" },
  DEBAR: { label: "Examination cancelled and debarred", effect: "All papers cancelled and the student is debarred from the next examination", result: "EXAM" },
};

export const UFM_STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "red" }> = {
  REPORTED: { label: "Reported — notice pending", tone: "amber" },
  HEARING: { label: "Hearing scheduled", tone: "blue" },
  DECIDED: { label: "Decided", tone: "green" },
};
