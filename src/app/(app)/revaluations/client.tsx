"use client";

import { useState, useTransition } from "react";
import { Gavel, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, Select, Textarea } from "@/components/ui";
import { applyRevaluationAction, assignRevaluatorAction, decideRevaluationAction } from "./actions";

export function ApplyForm({ scriptId, code, feeRevaluation, feeScrutiny, existing }: { scriptId: string; code: string; feeRevaluation: number; feeScrutiny: number; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"REVALUATION" | "SCRUTINY">(existing.includes("REVALUATION") ? "SCRUTINY" : "REVALUATION");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("UPI");
  const [pending, start] = useTransition();
  const available = (["REVALUATION", "SCRUTINY"] as const).filter((t) => !existing.includes(t));
  if (!available.length) return null;
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Apply
      </Button>
    );
  const fee = type === "REVALUATION" ? feeRevaluation : feeScrutiny;
  return (
    <div className="w-80 space-y-2 rounded-lg border border-border bg-white p-3 text-left shadow-lg">
      <div className="text-xs font-semibold">{code}</div>
      <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        {available.map((t) => (
          <option key={t} value={t}>{t === "REVALUATION" ? `Revaluation (fresh evaluation) — ₹${feeRevaluation}` : `Scrutiny / re-totalling — ₹${feeScrutiny}`}</option>
        ))}
      </Select>
      <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Select value={method} onChange={(e) => setMethod(e.target.value)}>
        <option value="UPI">Pay by UPI</option>
        <option value="NETBANKING">Net banking</option>
        <option value="CARD">Debit / credit card</option>
      </Select>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          variant="success"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await applyRevaluationAction(scriptId, type, reason, method);
              if ("error" in r && r.error) toast.error(r.error);
              else {
                toast.success(type === "SCRUTINY" ? "Scrutiny completed — the Controller of Examinations will confirm the outcome" : "Application submitted — your script will be re-evaluated blind");
                setOpen(false);
              }
            })
          }
        >
          <Send className="h-3.5 w-3.5" /> Pay ₹{fee} & apply
        </Button>
      </div>
    </div>
  );
}

export function AssignForm({ requestId, options }: { requestId: string; options: { id: string; name: string; role: string; eligible: boolean; reason: string | null }[] }) {
  const firstEligible = options.find((o) => o.eligible)?.id ?? "";
  const [value, setValue] = useState(firstEligible);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select className="h-8 w-64 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.role === "EVALUATOR" ? "external" : "faculty"}){o.eligible ? "" : ` — ${o.reason}`}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={pending || !value}
        onClick={() =>
          start(async () => {
            const r = await assignRevaluatorAction(requestId, value);
            if ("error" in r && r.error) toast.error(r.error);
            else toast.success("Script sent for blind re-evaluation");
          })
        }
      >
        <UserCheck className="h-3.5 w-3.5" /> Assign
      </Button>
    </div>
  );
}

export function DecideButton({ requestId, label }: { requestId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="success"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await decideRevaluationAction(requestId);
          if ("error" in r && r.error) toast.error(r.error);
          else if ("note" in r) toast.success(`${r.note}${r.newSheet ? ` — revised grade sheet ${r.newSheet} issued` : ""}`);
        })
      }
    >
      <Gavel className="h-3.5 w-3.5" /> {pending ? "Applying rule…" : label}
    </Button>
  );
}
