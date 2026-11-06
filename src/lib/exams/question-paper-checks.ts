export type QPQuestion = { no: string; unit: string; marks: number; text: string; orText?: string };
export type QPContent = { instructions: string; questions: QPQuestion[] };
export type QPCheck = { id: string; label: string; level: "pass" | "warn" | "fail"; detail: string };
export type QPCheckContext = { maxMarks: number; durationMins: number; scheme: { q: string; max: number }[] | null; setterName?: string | null };

export const UNITS = ["I", "II", "III", "IV", "V"];
const MIN_TEXT = 20;

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));

function overlap(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size);
}

/** Automatic checks run on every save and before submission, moderation and sealing. "fail" blocks progress; "warn" is for the moderator to judge. */
export function runChecks(c: QPContent, ctx: QPCheckContext): QPCheck[] {
  const qs = c.questions;
  const checks: QPCheck[] = [];
  const total = qs.reduce((a, q) => a + (Number.isFinite(q.marks) ? q.marks : 0), 0);

  checks.push(
    total === ctx.maxMarks
      ? { id: "total", label: "Marks add up to the paper maximum", level: "pass", detail: `${qs.length} questions totalling ${total} = ${ctx.maxMarks} marks` }
      : { id: "total", label: "Marks add up to the paper maximum", level: "fail", detail: `Questions add up to ${total}, but the paper carries ${ctx.maxMarks} — ${total < ctx.maxMarks ? "add" : "remove"} ${Math.abs(ctx.maxMarks - total)} mark(s)` },
  );

  const badMarks = qs.filter((q) => !(q.marks > 0) || Math.round(q.marks * 2) !== q.marks * 2).map((q) => q.no);
  checks.push(
    badMarks.length
      ? { id: "marks", label: "Marks are positive whole or half marks", level: "fail", detail: `Check ${badMarks.join(", ")}` }
      : { id: "marks", label: "Marks are positive whole or half marks", level: "pass", detail: "All questions carry valid marks" },
  );

  const empty = qs.flatMap((q) => [
    ...(q.text.trim().length < MIN_TEXT ? [`${q.no}${q.orText !== undefined ? " (a)" : ""}`] : []),
    ...(q.orText !== undefined && q.orText.trim().length < MIN_TEXT ? [`${q.no} (b)`] : []),
  ]);
  checks.push(
    !qs.length
      ? { id: "text", label: "Every question is written out", level: "fail", detail: "The paper has no questions yet" }
      : empty.length
        ? { id: "text", label: "Every question is written out", level: "fail", detail: `Missing or too short (under ${MIN_TEXT} characters): ${empty.join(", ")}` }
        : { id: "text", label: "Every question is written out", level: "pass", detail: `${qs.length} questions, ${qs.filter((q) => q.orText !== undefined).length} with an internal choice (OR)` },
  );

  const scheme = ctx.scheme ?? [];
  const sameScheme = scheme.length === qs.length && scheme.every((s, i) => s.q === qs[i]?.no && s.max === qs[i]?.marks);
  checks.push(
    sameScheme
      ? { id: "scheme", label: "Matches the evaluators' marking scheme", level: "pass", detail: `Evaluators will mark ${scheme.map((s) => `${s.q} /${s.max}`).join(", ")}` }
      : { id: "scheme", label: "Matches the evaluators' marking scheme", level: "warn", detail: `Marking screen currently expects ${scheme.length ? scheme.map((s) => `${s.q} /${s.max}`).join(", ") : "no questions"}; it will be regenerated from this paper when sealed` },
  );

  const missing = UNITS.filter((u) => !qs.some((q) => q.unit === u));
  checks.push(
    missing.length
      ? { id: "coverage", label: "Covers every unit of the syllabus", level: "warn", detail: `No question from Unit ${missing.join(", Unit ")}` }
      : { id: "coverage", label: "Covers every unit of the syllabus", level: "pass", detail: "Units I–V are all examined" },
  );

  const heavy = qs.filter((q) => q.marks > ctx.maxMarks * 0.3).map((q) => `${q.no} (${q.marks})`);
  checks.push(
    heavy.length
      ? { id: "balance", label: "No single question dominates the paper", level: "warn", detail: `${heavy.join(", ")} carr${heavy.length > 1 ? "y" : "ies"} more than 30% of the marks` }
      : { id: "balance", label: "No single question dominates the paper", level: "pass", detail: `Largest question carries ${Math.max(0, ...qs.map((q) => q.marks))} of ${ctx.maxMarks}` },
  );

  const texts = qs.flatMap((q) => [{ id: `${q.no}${q.orText !== undefined ? " (a)" : ""}`, t: q.text }, ...(q.orText !== undefined ? [{ id: `${q.no} (b)`, t: q.orText }] : [])]);
  const alike: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const o = overlap(texts[i].t, texts[j].t);
      if (o >= 0.7) alike.push(`${texts[i].id} ≈ ${texts[j].id} (${Math.round(o * 100)}% overlap)`);
    }
  }
  checks.push(
    alike.length
      ? { id: "duplicates", label: "No repeated or near-identical questions", level: "warn", detail: alike.join("; ") }
      : { id: "duplicates", label: "No repeated or near-identical questions", level: "pass", detail: "Every question and alternative is distinct" },
  );

  const who = (ctx.setterName ?? "").replace(/^(Prof\.\s*\(Dr\.\)|Dr\.|Prof\.|Mr\.|Ms\.)\s*/i, "").trim().toLowerCase();
  const leaks = who && [c.instructions, ...texts.map((t) => t.t)].some((s) => s.toLowerCase().includes(who));
  checks.push(
    leaks
      ? { id: "identity", label: "Does not reveal the paper setter", level: "fail", detail: "The setter's name appears in the paper — remove it before submission" }
      : { id: "identity", label: "Does not reveal the paper setter", level: "pass", detail: "No setter identity in the instructions or questions" },
  );

  checks.push(
    c.instructions.trim().length >= MIN_TEXT
      ? { id: "instructions", label: "Instructions to candidates are given", level: "pass", detail: `${Math.round((ctx.durationMins / Math.max(1, ctx.maxMarks)) * 10) / 10} minutes per mark over ${ctx.durationMins} minutes` }
      : { id: "instructions", label: "Instructions to candidates are given", level: "warn", detail: "Add instructions (e.g. how many questions to attempt, use of bare acts)" },
  );
  return checks;
}

export const blocking = (checks: QPCheck[]) => checks.filter((c) => c.level === "fail");
