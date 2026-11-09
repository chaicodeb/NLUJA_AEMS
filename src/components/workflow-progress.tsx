import { Check, Clock, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/roles";
import type { WorkflowView } from "@/lib/workflow/engine";
import { cn, formatDate } from "@/lib/utils";

/** Approval chain of one request: done, current and remaining steps, with who decided each. */
export function WorkflowProgress({ view }: { view: WorkflowView }) {
  return (
    <div className="space-y-1.5">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {view.steps.map((s, i) => {
          const act = view.actions.find((a) => a.step === i);
          const state = act ? (act.decision === "APPROVED" ? "done" : "rejected") : view.status === "PENDING" && i === view.current ? "current" : "todo";
          return (
            <li key={i} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                  state === "done" && "border-leaf-100 bg-leaf-50 text-leaf-700",
                  state === "rejected" && "border-red-200 bg-red-50 text-red-700",
                  state === "current" && "border-amber-300 bg-amber-50 font-medium text-amber-900",
                  state === "todo" && "border-border text-muted-foreground",
                )}
                title={s.roles.map((r) => ROLE_LABELS[r as Role]).join(" / ")}
              >
                {state === "done" ? <Check className="h-3 w-3" /> : state === "rejected" ? <X className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {i + 1}. {s.name}
              </span>
              {i < view.steps.length - 1 && <span className="text-muted-foreground">→</span>}
            </li>
          );
        })}
        <li className="text-[11px] text-muted-foreground">· workflow v{view.version}</li>
      </ol>
      {view.actions.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {view.actions.map((a, i) => (
            <li key={i}>
              {a.stepName}: <span className={a.decision === "APPROVED" ? "text-leaf-700" : "text-red-700"}>{a.decision === "APPROVED" ? "approved" : "rejected"}</span> by {a.actorName} ({ROLE_LABELS[a.actorRole as Role] ?? a.actorRole}) · {formatDate(a.at, true)}
              {a.note ? ` · ${a.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      {view.status === "PENDING" && view.steps[view.current] && (
        <div className="text-[11px] text-amber-800">
          With: {view.steps[view.current].roles.map((r) => ROLE_LABELS[r as Role]).join(" / ")} · target {view.steps[view.current].slaDays} day(s)
        </div>
      )}
    </div>
  );
}

/** Whether this user may decide the current step. */
export function canActOn(view: WorkflowView, user: { id: string; role: string }) {
  const step = view.steps[view.current];
  return view.status === "PENDING" && !!step && step.roles.includes(user.role as Role) && !view.actions.some((a) => a.actorId === user.id);
}
