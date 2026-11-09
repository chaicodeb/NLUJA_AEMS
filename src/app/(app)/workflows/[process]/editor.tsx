"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { Button, Callout, Card, CardHeader, Input, Label, Select, Textarea } from "@/components/ui";
import { OPS, PROCESSES, applicable, validateSteps, type Condition, type ProcessKey, type Step } from "@/lib/workflow/shared";
import { cn } from "@/lib/utils";
import { Chain } from "../chain";
import { saveWorkflowAction } from "../actions";

export function WorkflowEditor({ process, initial, roleLabels }: { process: ProcessKey; initial: Step[]; roleLabels: Record<string, string> }) {
  const spec = PROCESSES[process];
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(initial);
  const [note, setNote] = useState("");
  const [facts, setFacts] = useState<Record<string, string>>(spec.example);
  const [pending, start] = useTransition();
  const error = validateSteps(process, steps);
  const changed = JSON.stringify(steps) !== JSON.stringify(initial);
  const sample = applicable(steps, Object.fromEntries(spec.facts.map((f) => [f.key, f.kind === "number" ? Number(facts[f.key] || 0) : facts[f.key]])));

  const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const firstFact = spec.facts[0];
  const blankCondition = (): Condition => ({ fact: firstFact.key, op: firstFact.kind === "number" ? "gt" : "eq", value: firstFact.options?.[0]?.[0] ?? "" });

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-3">
        {steps.map((s, i) => {
          const fact = spec.facts.find((f) => f.key === s.when?.fact);
          return (
            <Card key={i}>
              <CardHeader
                title={`Step ${i + 1}`}
                action={
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Remove step" disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                }
              />
              <div className="space-y-3 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  <div className="space-y-1">
                    <Label>Step name</Label>
                    <Input value={s.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="e.g. Dean's approval" />
                  </div>
                  <div className="space-y-1">
                    <Label>Target (days)</Label>
                    <Input type="number" min={1} max={30} value={s.slaDays} onChange={(e) => set(i, { slaDays: e.target.valueAsNumber })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Who can approve this step</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(roleLabels).map(([r, label]) => {
                      const on = s.roles.includes(r as Role);
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set(i, { roles: on ? s.roles.filter((x) => x !== r) : [...s.roles, r as Role] })}
                          className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-white hover:bg-muted")}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!s.when} onChange={(e) => set(i, { when: e.target.checked ? blankCondition() : null })} />
                    Only for some requests
                  </label>
                  {s.when && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Select aria-label="Condition field" value={s.when.fact} onChange={(e) => { const f = spec.facts.find((x) => x.key === e.target.value)!; set(i, { when: { fact: f.key, op: f.kind === "number" ? "gt" : "eq", value: f.options?.[0]?.[0] ?? "" } }); }}>
                        {spec.facts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </Select>
                      <Select aria-label="Condition operator" value={s.when.op} onChange={(e) => set(i, { when: { ...s.when!, op: e.target.value as Condition["op"] } })}>
                        {OPS.filter(([o]) => fact?.kind === "number" || o === "eq" || o === "neq").map(([o, l]) => <option key={o} value={o}>{l}</option>)}
                      </Select>
                      {fact?.kind === "choice" ? (
                        <Select aria-label="Condition value" value={s.when.value} onChange={(e) => set(i, { when: { ...s.when!, value: e.target.value } })}>
                          {fact.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </Select>
                      ) : (
                        <Input aria-label="Condition value" type="number" value={s.when.value} onChange={(e) => set(i, { when: { ...s.when!, value: e.target.value } })} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        <Button variant="outline" onClick={() => setSteps((s) => [...s, { name: "", roles: [], slaDays: 3, when: null }])}>
          <Plus className="h-4 w-4" /> Add a step
        </Button>
      </div>

      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader title="The chain as configured" />
          <div className="p-4 sm:p-5"><Chain process={process} steps={steps} /></div>
        </Card>
        <Card>
          <CardHeader title="Try it before saving" description="See which steps a particular request would go through" />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {spec.facts.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label>{f.label}</Label>
                  {f.kind === "choice" ? (
                    <Select value={facts[f.key]} onChange={(e) => setFacts((x) => ({ ...x, [f.key]: e.target.value }))}>
                      {f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  ) : (
                    <Input type="number" min={1} value={facts[f.key]} onChange={(e) => setFacts((x) => ({ ...x, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
              <span>{sample.length ? sample.map((s, i) => `${i + 1}. ${s.name} (${s.roles.map((r) => roleLabels[r]).join(" / ") || "nobody"})`).join(" → ") : "No step applies — add a step without a condition."}</span>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Save as a new version" />
          <div className="space-y-3 p-4 sm:p-5">
            {error && changed && <Callout tone="red">{error}</Callout>}
            <div className="space-y-1">
              <Label>Reason for the change</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Academic Council resolution AC/2026/14: medical leave over three days to be verified by the Academic Section" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || !changed || !!error || note.trim().length < 10}
                onClick={() =>
                  start(async () => {
                    const r = await saveWorkflowAction(process, steps, note);
                    if ("error" in r && r.error) toast.error(r.error);
                    else {
                      toast.success(`Version ${"version" in r ? r.version : ""} is now in force — new requests follow it`);
                      setNote("");
                      router.refresh();
                    }
                  })
                }
              >
                <Save className="h-4 w-4" /> Save version
              </Button>
              <Button variant="ghost" disabled={pending || !changed} onClick={() => setSteps(initial)}>Discard changes</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
