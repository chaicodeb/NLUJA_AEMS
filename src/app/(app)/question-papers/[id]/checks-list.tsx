import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { QPCheck } from "@/lib/exams/question-paper-checks";

export function ChecksList({ checks }: { checks: QPCheck[] }) {
  return (
    <ul className="divide-y divide-border">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2.5 px-4 py-2.5 text-sm sm:px-5">
          {c.level === "pass" ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
          ) : c.level === "warn" ? (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          )}
          <div className="min-w-0">
            <div className="font-medium">{c.label}</div>
            <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
