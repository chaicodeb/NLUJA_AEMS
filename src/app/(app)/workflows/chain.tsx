import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/roles";
import { describeCondition, type ProcessKey, type Step } from "@/lib/workflow/shared";

/** A workflow drawn as a chain of boxes: who approves, when the step applies, and its target. */
export function Chain({ process, steps }: { process: ProcessKey; steps: Step[] }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-2 text-xs">
      <li className="flex items-center rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">Request submitted</li>
      {steps.map((s, i) => (
        <li key={i} className="flex items-stretch gap-2">
          <span className="self-center text-muted-foreground">→</span>
          <div className={`rounded-lg border px-3 py-2 ${s.when ? "border-amber-300 bg-amber-50" : "border-brand-200 bg-brand-50"}`}>
            <div className="font-semibold text-foreground">{i + 1}. {s.name}</div>
            <div className="text-muted-foreground">{s.roles.map((r) => ROLE_LABELS[r as Role]).join(" / ")} · {s.slaDays} day(s)</div>
            {s.when && <div className="mt-0.5 text-amber-900">Only when {describeCondition(process, s.when)}</div>}
          </div>
        </li>
      ))}
      <li className="flex items-stretch gap-2">
        <span className="self-center text-muted-foreground">→</span>
        <span className="flex items-center rounded-lg border border-leaf-100 bg-leaf-50 px-3 py-2 text-leaf-700">Approved — effect applied</span>
      </li>
    </ol>
  );
}
