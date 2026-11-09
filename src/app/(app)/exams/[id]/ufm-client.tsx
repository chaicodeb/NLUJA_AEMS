"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Gavel, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { UFM_CATEGORIES, UFM_PENALTIES } from "@/lib/exams/ufm-shared";
import { decideCaseAction, reportCaseAction, scheduleHearingAction } from "./ufm-actions";

type Result = { ok?: boolean; error?: string };
const report = (r: Result, success: string) => {
  if (r.error) toast.error(r.error);
  else toast.success(success);
};

export function ReportCaseForm({ papers }: { papers: { id: string; code: string; title: string }[] }) {
  const [form, setForm] = useState({ examPaperId: papers[0]?.id ?? "", rollNo: "", category: "CHITS", description: "", material: "", invigilator: "" });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Paper</Label>
          <Select value={form.examPaperId} onChange={(e) => set("examPaperId", e.target.value)}>
            {papers.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Roll number</Label>
          <Input value={form.rollNo} onChange={(e) => set("rollNo", e.target.value)} placeholder="e.g. BAL22-004" />
        </div>
        <div className="space-y-1">
          <Label>Kind of unfair means</Label>
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(UFM_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </div>
      <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What the invigilator observed, and when (as written in the report)" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={form.material} onChange={(e) => set("material", e.target.value)} placeholder="Material seized (e.g. two handwritten chits, sealed in envelope UFM/26/01)" />
        <Input value={form.invigilator} onChange={(e) => set("invigilator", e.target.value)} placeholder="Reporting invigilator" />
      </div>
      <div className="flex justify-end">
        <Button variant="danger" disabled={pending} onClick={() => start(async () => report(await reportCaseAction(form), "Case recorded — the paper's result is withheld until the committee decides"))}>
          <ShieldAlert className="h-4 w-4" /> Record unfair-means report
        </Button>
      </div>
    </div>
  );
}

export function HearingForm({ caseId }: { caseId: string }) {
  const [at, setAt] = useState("");
  const [committee, setCommittee] = useState("Prof. N. Goswami (Chair), Dr. Ananya Bora, Mr. D. Kalita (Member Secretary)");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
      <Input type="datetime-local" aria-label="Hearing date and time" value={at} onChange={(e) => setAt(e.target.value)} />
      <Input aria-label="Committee" value={committee} onChange={(e) => setCommittee(e.target.value)} />
      <Button size="sm" disabled={pending || !at} onClick={() => start(async () => report(await scheduleHearingAction(caseId, new Date(at).toISOString(), committee), "Show-cause notice issued — the student has been notified"))}>
        <CalendarClock className="h-3.5 w-3.5" /> Issue notice
      </Button>
    </div>
  );
}

export function DecisionForm({ caseId }: { caseId: string }) {
  const [penalty, setPenalty] = useState("CANCEL_PAPER");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[16rem_1fr]">
        <Select aria-label="Decision" value={penalty} onChange={(e) => setPenalty(e.target.value)}>
          {Object.entries(UFM_PENALTIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Input aria-label="Reasons" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Committee's reasons (heard the student; material examined…)" />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{UFM_PENALTIES[penalty].effect}</span>
        <Button size="sm" disabled={pending} onClick={() => start(async () => report(await decideCaseAction(caseId, penalty, note), "Decision recorded — applied when results are processed"))}>
          <Gavel className="h-3.5 w-3.5" /> Record decision
        </Button>
      </div>
    </div>
  );
}
