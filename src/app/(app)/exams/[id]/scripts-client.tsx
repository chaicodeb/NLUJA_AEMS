"use client";

import { useState, useTransition } from "react";
import { ScanLine, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button, Select } from "@/components/ui";
import { conductExamAction, reassignEvaluatorAction, reopenEvaluationAction } from "./actions";

export function ConductExamButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="accent"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const r = await conductExamAction(examId);
          if ("error" in r) toast.error(r.error);
          else toast.success(`${r.scripts} scripts collected, masked and scanned · ${r.absent} absent · ${r.pending} evaluations left for live demo`);
        })
      }
    >
      <ScanLine className="h-4 w-4" /> {pending ? "Collecting & scanning scripts…" : "Conduct examination & scan scripts (simulate)"}
    </Button>
  );
}

export function EvaluatorSelect({ examId, examPaperId, round, current, options }: { examId: string; examPaperId: string; round: number; current: string; options: { id: string; label: string }[] }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  return (
    <Select
      value={value}
      disabled={pending}
      className="h-8 text-xs"
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          const r = await reassignEvaluatorAction(examId, examPaperId, round, next);
          if ("error" in r) {
            toast.error(r.error);
            setValue(current);
          } else {
            setValue(next);
            toast.success(`${r.count} pending script(s) reassigned`);
          }
        });
      }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </Select>
  );
}

export function ReopenButton({ examId, evaluationId }: { examId: string; evaluationId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      title="Administrative override (logged)"
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-red-300 hover:text-red-700"
      onClick={() => {
        const reason = prompt("Reason for re-opening this locked evaluation (recorded in the audit trail):");
        if (reason === null) return;
        start(async () => {
          const r = await reopenEvaluationAction(examId, evaluationId, reason);
          if ("error" in r && r.error) toast.error(r.error);
          else toast.success("Evaluation re-opened; override logged");
        });
      }}
    >
      <Unlock className="h-3 w-3" /> Re-open
    </button>
  );
}
