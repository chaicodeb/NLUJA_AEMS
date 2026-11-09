"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { decideLeaveAction } from "../actions";

export function LeaveDecision({ leaveId, type, stepName }: { leaveId: string; type: string; stepName: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideLeaveAction(leaveId, approve, note);
      if ("error" in r && r.error) toast.error(r.error);
      else if ("next" in r && r.next) toast.success(`${stepName} approved — passed to “${r.next}”`);
      else if (approve && "sessions" in r)
        toast.success(`Approved — ${r.sessions} class record(s) updated${type === "DUTY" && r.courses?.length ? `; attendance now ${r.courses.join(", ")}` : ""}`);
      else toast.success("Application rejected");
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{stepName}:</span>
      <Input className="h-8 max-w-sm text-sm" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" variant="success" disabled={pending} onClick={() => decide(true)}>
        <Check className="h-3.5 w-3.5" /> Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
    </div>
  );
}
