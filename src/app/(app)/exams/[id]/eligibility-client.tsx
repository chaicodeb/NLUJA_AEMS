"use client";

import { useState, useTransition } from "react";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, Select, Textarea } from "@/components/ui";
import { fileRelaxationAction, runEligibilityAction } from "./actions";

export function EligibilityControls({ examId }: { examId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="accent"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const s = await runEligibilityAction(examId);
          toast.success(`Eligibility computed: ${s.ELIGIBLE} eligible, ${s.INELIGIBLE} ineligible, ${s.PENDING_RELAXATION} pending, ${s.RELAXED} relaxed`);
        })
      }
    >
      <PlayCircle className="h-4 w-4" /> {pending ? "Evaluating rules…" : "Run eligibility check"}
    </Button>
  );
}

export function RelaxationButton({ examId, enrolmentId, student, course }: { examId: string; enrolmentId: string; student: string; course: string }) {
  const [open, setOpen] = useState(false);
  const [ground, setGround] = useState("MEDICAL");
  const [remarks, setRemarks] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Request relaxation
      </Button>
    );
  return (
    <div className="w-72 space-y-2 rounded-lg border border-border bg-white p-3 text-left shadow-lg">
      <div className="text-xs font-semibold">{student} · {course}</div>
      <Select value={ground} onChange={(e) => setGround(e.target.value)}>
        <option value="MEDICAL">Medical grounds</option>
        <option value="EMERGENCY">Genuine emergency</option>
      </Select>
      <Textarea rows={2} placeholder="Supporting details / documents" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await fileRelaxationAction(examId, enrolmentId, ground, remarks);
              if ("error" in res && res.error) toast.error(res.error);
              else {
                toast.success("Relaxation request sent to the Vice-Chancellor");
                setOpen(false);
              }
            })
          }
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
