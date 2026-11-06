import type { QPContent } from "@/lib/exams/question-paper-checks";

/** The paper exactly as a candidate would receive it in the hall; a diagonal watermark marks drafts. */
export function QuestionPaperView({
  content, header, watermark,
}: {
  content: QPContent;
  header: { exam: string; code: string; title: string; when: string; durationMins: number; maxMarks: number };
  watermark?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-white p-5 text-[15px] leading-relaxed text-stone-900 shadow-sm sm:p-8">
      {watermark && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[30deg] whitespace-nowrap text-3xl font-bold tracking-widest text-red-700/10 sm:text-5xl">{watermark}</span>
        </div>
      )}
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-700">National Law University and Judicial Academy, Assam</div>
        <div className="mt-1 text-sm">{header.exam}</div>
        <div className="mt-2 font-serif text-lg font-bold">{header.code} — {header.title}</div>
        <div className="text-xs text-stone-500">{header.when}</div>
      </div>
      <div className="mt-3 flex justify-between border-b-2 border-brand-700 pb-1 text-sm font-semibold">
        <span>Time: {header.durationMins / 60} hours</span>
        <span>Maximum Marks: {header.maxMarks}</span>
      </div>
      {content.instructions && <p className="mt-3 text-sm italic text-stone-600">{content.instructions}</p>}
      <ol className="mt-4 space-y-4">
        {content.questions.map((q) => (
          <li key={q.no} className="flex gap-3">
            <span className="w-8 shrink-0 font-bold">{q.no}.</span>
            <div className="min-w-0 flex-1 space-y-2 [overflow-wrap:anywhere]">
              <p className="whitespace-pre-line">{q.orText !== undefined && <span className="font-semibold">(a) </span>}{q.text || <span className="text-red-600">[question not written yet]</span>}</p>
              {q.orText !== undefined && (
                <>
                  <p className="text-center text-xs font-bold tracking-widest text-stone-500">OR</p>
                  <p className="whitespace-pre-line"><span className="font-semibold">(b) </span>{q.orText || <span className="text-red-600">[alternative not written yet]</span>}</p>
                </>
              )}
            </div>
            <span className="shrink-0 font-semibold">[{q.marks}]</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-xs tracking-widest text-stone-400">*** End of question paper ***</p>
    </div>
  );
}
