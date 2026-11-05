import type { Summary } from "@/lib/feedback/shared";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export function QuestionBreakdown({ summary, title }: { summary: Summary; title: string }) {
  return (
    <Card>
      <CardHeader title={title} description="Mean score and distribution from 1 (strongly disagree) to 5 (strongly agree)" />
      <ul className="divide-y divide-border">
        {summary.perQuestion.map((q) => {
          const total = q.dist.reduce((a, b) => a + b, 0) || 1;
          return (
            <li key={q.id} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[1fr_260px_48px] md:items-center">
              <div><span className="text-xs text-muted-foreground">{q.section} · </span>{q.text}</div>
              <div className="flex h-3 overflow-hidden rounded">
                {q.dist.map((d, i) => (
                  <div key={i} title={`${i + 1}: ${d}`} className={["bg-red-500", "bg-orange-400", "bg-slate-300", "bg-sky-500", "bg-leaf-600"][i]} style={{ width: `${(d / total) * 100}%` }} />
                ))}
              </div>
              <div className={cn("text-right font-semibold tabular-nums", (q.mean ?? 5) < 3.6 && "text-amber-700")}>{q.mean ?? "—"}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function Comments({ summary }: { summary: Summary }) {
  return (
    <Card>
      <CardHeader title={`Comments (${summary.comments.length})`} description="Verbatim and anonymous" />
      <ul className="divide-y divide-border">
        {summary.comments.map((c, i) => (
          <li key={i} className="px-5 py-2.5 text-sm">
            &ldquo;{c.text}&rdquo; <span className="text-xs text-muted-foreground">— {c.question}</span>
          </li>
        ))}
        {summary.comments.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">No comments.</li>}
      </ul>
    </Card>
  );
}
