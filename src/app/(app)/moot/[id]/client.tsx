"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select } from "@/components/ui";
import type { Criterion } from "@/lib/moot/shared";
import { postToMarksAction, saveMemorialAction, scheduleRoundAction } from "../actions";

export function ScheduleRoundForm({ competitionId, teams, courtrooms }: { competitionId: string; teams: { id: string; code: string }[]; courtrooms: string[] }) {
  const [form, setForm] = useState({ stage: "SEMI_FINAL", name: "Semi-final 1", courtroom: courtrooms[0], startsAt: "", durationMins: 60, petitionerId: teams[0]?.id ?? "", respondentId: teams[1]?.id ?? "", judges: "Justice (Retd.) B. K. Sharma, Adv. Pallavi Deka, Adv. Rupam Choudhury" });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Schedule a round</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select aria-label="Stage" value={form.stage} onChange={(e) => set("stage", e.target.value)}>
          <option value="PRELIMINARY">Preliminary</option>
          <option value="SEMI_FINAL">Semi-final</option>
          <option value="FINAL">Final</option>
        </Select>
        <Input aria-label="Round name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <Select aria-label="Court hall" value={form.courtroom} onChange={(e) => set("courtroom", e.target.value)}>
          {courtrooms.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input aria-label="Date and time" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        <Select aria-label="Petitioner" value={form.petitionerId} onChange={(e) => set("petitionerId", e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>Petitioner: Team {t.code}</option>)}
        </Select>
        <Select aria-label="Respondent" value={form.respondentId} onChange={(e) => set("respondentId", e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>Respondent: Team {t.code}</option>)}
        </Select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label>Bench (comma-separated, up to three)</Label>
          <Input value={form.judges} onChange={(e) => set("judges", e.target.value)} />
        </div>
        <Button
          disabled={pending || !form.startsAt}
          onClick={() =>
            start(async () => {
              const r = await scheduleRoundAction(competitionId, { ...form, startsAt: new Date(form.startsAt).toISOString(), judges: form.judges.split(",") });
              if ("error" in r && r.error) toast.error(r.error);
              else toast.success(`${form.name} booked in ${form.courtroom}`);
            })
          }
        >
          <CalendarPlus className="h-4 w-4" /> Book hall and schedule
        </Button>
      </div>
    </div>
  );
}

export function MemorialEditor({ teamId, code, criteria, initial }: { teamId: string; code: string; criteria: Criterion[]; initial: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(criteria.map((k) => [k.code, initial[k.code]?.toString() ?? ""])));
  const [evaluator, setEvaluator] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Score memorial</Button>;
  return (
    <div className="ml-auto w-72 space-y-2 rounded-lg border border-border bg-white p-3 text-left shadow-lg">
      <div className="text-xs font-semibold">Team {code} memorial</div>
      {criteria.map((k) => (
        <label key={k.code} className="flex items-center justify-between gap-2 text-xs">
          <span>{k.name} (/{k.max})</span>
          <Input className="h-7 w-16 text-xs" type="number" min={0} max={k.max} step={0.5} value={values[k.code]} onChange={(e) => setValues((v) => ({ ...v, [k.code]: e.target.value }))} />
        </label>
      ))}
      <Input className="h-7 text-xs" placeholder="Evaluated by" value={evaluator} onChange={(e) => setEvaluator(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveMemorialAction(teamId, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])), evaluator);
              if ("error" in r && r.error) toast.error(r.error);
              else {
                toast.success(`Team ${code} memorial: ${"total" in r ? r.total : ""}/100 — rankings updated`);
                setOpen(false);
              }
            })
          }
        >
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  );
}

export function PostMarksButton({ competitionId }: { competitionId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await postToMarksAction(competitionId);
          if ("error" in r && r.error) toast.error(r.error, { duration: 9000 });
          else toast.success("Moot scores posted to the course's marks sheets as drafts — submit them from Internal Marks");
        })
      }
    >
      <Send className="h-3.5 w-3.5" /> Post to internal marks
    </Button>
  );
}
