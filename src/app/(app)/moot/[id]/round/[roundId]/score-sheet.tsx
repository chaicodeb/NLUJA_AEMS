"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { ROLES, type Criterion } from "@/lib/moot/shared";
import { saveScoreSheetAction } from "../../../actions";

type Participant = { id: string; name: string; role: string; team: string; side: string; criteria: Criterion[] };

export function ScoreSheet({ roundId, judges, participants, existing }: { roundId: string; judges: string[]; participants: Participant[]; existing: Record<string, Record<string, Record<string, number>>> }) {
  const router = useRouter();
  const firstMissing = judges.find((j) => !Object.keys(existing[j] ?? {}).length) ?? judges[0];
  const [judge, setJudge] = useState(firstMissing);
  const blank = (j: string) => Object.fromEntries(participants.map((p) => [p.id, Object.fromEntries(p.criteria.map((c) => [c.code, existing[j]?.[p.id]?.[c.code]?.toString() ?? ""]))]));
  const [values, setValues] = useState<Record<string, Record<string, string>>>(blank(firstMissing));
  const [pending, start] = useTransition();
  const total = (p: Participant) => p.criteria.reduce((a, c) => a + (Number(values[p.id]?.[c.code]) || 0), 0);

  return (
    <Card>
      <CardHeader
        title="Score sheet"
        description="Enter one judge's sheet at a time; the round result and the team rankings update when every judge's sheet is in"
        action={
          <Select aria-label="Judge" value={judge} onChange={(e) => { setJudge(e.target.value); setValues(blank(e.target.value)); }} className="w-64">
            {judges.map((j) => <option key={j} value={j}>{j}{Object.keys(existing[j] ?? {}).length ? " ✓" : ""}</option>)}
          </Select>
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        {participants.map((p) => (
          <div key={p.id} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{p.name} <span className="text-xs font-normal text-muted-foreground">· Team {p.team} · {p.side} · {ROLES[p.role]}</span></span>
              <span className="text-xs font-semibold">{total(p)} / {p.criteria.reduce((a, c) => a + c.max, 0)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {p.criteria.map((c) => (
                <label key={c.code} className="space-y-1 text-[11px] text-muted-foreground">
                  <span className="block truncate" title={c.name}>{c.name} (/{c.max})</span>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    min={0}
                    max={c.max}
                    step={0.5}
                    aria-label={`${p.name} ${c.name}`}
                    value={values[p.id]?.[c.code] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [p.id]: { ...v[p.id], [c.code]: e.target.value } }))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const sheet = Object.fromEntries(Object.entries(values).map(([m, crit]) => [m, Object.fromEntries(Object.entries(crit).map(([k, v]) => [k, v === "" ? NaN : Number(v)]))]));
                const r = await saveScoreSheetAction(roundId, judge, sheet);
                if ("error" in r && r.error) toast.error(r.error);
                else {
                  toast.success("complete" in r && r.complete ? "All sheets in — round result and rankings updated" : `${judge}'s sheet saved`);
                  router.refresh();
                }
              })
            }
          >
            <Save className="h-4 w-4" /> Save {judge}&apos;s sheet
          </Button>
        </div>
      </div>
    </Card>
  );
}
