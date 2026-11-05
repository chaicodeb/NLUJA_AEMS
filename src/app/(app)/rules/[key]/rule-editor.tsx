"use client";

import { useMemo, useState, useTransition } from "react";
import { Code2, FlaskConical, Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, CardHeader, Callout, Input, Label, Select, Textarea } from "@/components/ui";
import {
  compileAttendance, evaluateAttendance, gradeFor, RULE_FIELD_HELP,
  type AttendanceParams, type GraceParams, type GradingParams,
} from "@/lib/rules/engine";
import { previewAttendanceImpact, saveRuleAction } from "./actions";

type Props = { ruleKey: string; type: string; params: Record<string, unknown>; canEdit: boolean };

export function RuleEditor({ ruleKey, type, params, canEdit }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>(params);
  const [note, setNote] = useState("");
  const [saving, startSave] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(params);

  const save = () =>
    startSave(async () => {
      const res = await saveRuleAction(ruleKey, draft, note);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success(`Saved as version ${res.version}. Takes effect immediately.`);
        setNote("");
      }
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <Card>
        <CardHeader title="Parameters" description={canEdit ? "Edit and save — a new version is created and the previous one retained." : "Read-only for your role."} />
        <CardBody className="space-y-5">
          {type === "ATTENDANCE" && <AttendanceForm value={draft as AttendanceParams} onChange={setDraft} disabled={!canEdit} />}
          {type === "GRADING" && <GradingForm value={draft as GradingParams} onChange={setDraft} disabled={!canEdit} />}
          {type === "GRACE" && <GraceForm value={draft as GraceParams} onChange={setDraft} disabled={!canEdit} />}
          {type === "REVALUATION" && <RevaluationForm value={draft as RevaluationParams} onChange={setDraft} disabled={!canEdit} />}
          {canEdit && (
            <div className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="note">Reason for change / authority reference</Label>
              <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Academic Council Resolution No. AC/2026/14 dated 02.11.2026" />
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={!dirty || saving}>
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save new version"}
                </Button>
                <Button variant="ghost" onClick={() => setDraft(params)} disabled={!dirty || saving}>
                  Discard changes
                </Button>
                {dirty && <Badge tone="amber">Unsaved changes</Badge>}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-6">
        {type === "ATTENDANCE" && <AttendanceTester params={draft as AttendanceParams} />}
        {type === "ATTENDANCE" && <ImpactPreview ruleKey={ruleKey} params={draft as AttendanceParams} dirty={dirty} />}
        {type === "GRADING" && <GradingTester params={draft as GradingParams} />}
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Code2 className="h-4 w-4" /> Compiled rule</span>} description="What the rule engine evaluates (JSON-Logic). Generated from the parameters — never hand-coded." />
          <pre className="max-h-80 overflow-auto rounded-b-xl bg-ink-900 p-4 text-[11px] leading-relaxed text-brand-100">
            {JSON.stringify(type === "ATTENDANCE" ? compileAttendance(draft as AttendanceParams) : draft, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function num(v: string) {
  return v === "" ? 0 : Number(v);
}

function AttendanceForm({ value: p, onChange, disabled }: { value: AttendanceParams; onChange: (v: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (patch: Partial<AttendanceParams>) => onChange({ ...p, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Minimum attendance per course (%)" help={RULE_FIELD_HELP.courseMinPct}>
        <Input type="number" min={0} max={100} value={p.courseMinPct} disabled={disabled} onChange={(e) => set({ courseMinPct: num(e.target.value) })} />
      </Field>
      <Field label="Minimum semester attendance (%)" help={RULE_FIELD_HELP.semesterMinPct}>
        <Input type="number" min={0} max={100} value={p.semesterMinPct ?? ""} placeholder="Not applied" disabled={disabled} onChange={(e) => set({ semesterMinPct: e.target.value === "" ? null : Number(e.target.value) })} />
      </Field>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={p.relaxationEnabled} disabled={disabled} onChange={(e) => set({ relaxationEnabled: e.target.checked })} className="h-4 w-4 accent-brand-600" />
          Allow relaxation on emergency / medical grounds
        </label>
      </div>
      <Field label="Relaxation floor per course (%)" help={RULE_FIELD_HELP.relaxedCourseMinPct}>
        <Input type="number" value={p.relaxedCourseMinPct} disabled={disabled || !p.relaxationEnabled} onChange={(e) => set({ relaxedCourseMinPct: num(e.target.value) })} />
      </Field>
      <Field label="Aggregate required for relaxation (%)" help={RULE_FIELD_HELP.aggregateMinPct}>
        <Input type="number" value={p.aggregateMinPct} disabled={disabled || !p.relaxationEnabled} onChange={(e) => set({ aggregateMinPct: num(e.target.value) })} />
      </Field>
      <Field label="Approving authority" help={RULE_FIELD_HELP.relaxationAuthority}>
        <Select value={p.relaxationAuthority} disabled={disabled || !p.relaxationEnabled} onChange={(e) => set({ relaxationAuthority: e.target.value })}>
          <option value="VC">Vice-Chancellor</option>
          <option value="COE">Controller of Examinations</option>
          <option value="REGISTRAR">Registrar</option>
        </Select>
      </Field>
      <Field label="Permitted grounds">
        <div className="flex flex-wrap gap-3 pt-1.5 text-sm">
          {["MEDICAL", "EMERGENCY", "OTHER"].map((g) => (
            <label key={g} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-brand-600"
                disabled={disabled || !p.relaxationEnabled}
                checked={p.relaxationGrounds.includes(g)}
                onChange={(e) => set({ relaxationGrounds: e.target.checked ? [...p.relaxationGrounds, g] : p.relaxationGrounds.filter((x) => x !== g) })}
              />
              {g.charAt(0) + g.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}

const STATUS_TONE = { ELIGIBLE: "green", RELAXED: "blue", PENDING_RELAXATION: "amber", INELIGIBLE: "red" } as const;

function AttendanceTester({ params }: { params: AttendanceParams }) {
  const [course, setCourse] = useState(67);
  const [agg, setAgg] = useState(74);
  const [relax, setRelax] = useState<"none" | "pending" | "approved">("none");
  const res = evaluateAttendance(params, { coursePct: course, aggregatePct: agg, relaxationApproved: relax === "approved", relaxationPending: relax === "pending" });
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Test this rule</span>} description="Try any scenario against the parameters on the left (including unsaved edits)." />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Course %">
            <Input type="number" value={course} onChange={(e) => setCourse(num(e.target.value))} />
          </Field>
          <Field label="Aggregate %">
            <Input type="number" value={agg} onChange={(e) => setAgg(num(e.target.value))} />
          </Field>
          <Field label="Relaxation">
            <Select value={relax} onChange={(e) => setRelax(e.target.value as typeof relax)}>
              <option value="none">None</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </Select>
          </Field>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <Badge tone={STATUS_TONE[res.status]}>{res.status.replace("_", " ")}</Badge>
          <p className="mt-1.5 text-sm">{res.reason}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[
            [69, 78, "none"],
            [67, 74, "approved"],
            [64, 80, "none"],
            [66, 68, "none"],
          ].map(([c, a, r]) => (
            <button key={`${c}-${a}`} className="rounded border border-border bg-white px-2 py-1 hover:bg-muted" onClick={() => { setCourse(c as number); setAgg(a as number); setRelax(r as typeof relax); }}>
              {c}% / agg {a}%{r === "approved" ? " + VC" : ""}
            </button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function ImpactPreview({ ruleKey, params, dirty }: { ruleKey: string; params: AttendanceParams; dirty: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof previewAttendanceImpact>> | null>(null);
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Impact on current students</span>}
        description="Re-evaluates this cycle's eligibility decisions under the edited parameters before you save."
        action={
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => setResult(await previewAttendanceImpact(ruleKey, params)))}>
            {pending ? "Checking…" : "Preview impact"}
          </Button>
        }
      />
      {result && (
        <CardBody>
          {!result.computed ? (
            <Callout tone="amber">Eligibility has not been computed for the current examination yet. Run it from the examination page first.</Callout>
          ) : result.changes.length === 0 ? (
            <Callout tone="green">{dirty ? "No student's eligibility would change." : "No pending edits — decisions match the active rule."} ({result.total} decisions checked)</Callout>
          ) : (
            <div className="space-y-2">
              <Callout tone="amber"><strong>{result.changes.length}</strong> of {result.total} decisions would change.</Callout>
              <ul className="max-h-56 divide-y divide-border overflow-auto rounded border border-border text-sm">
                {result.changes.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span>{c.student} <span className="font-mono text-xs text-muted-foreground">{c.course} · {c.pct}%</span></span>
                    <span className="flex items-center gap-1 text-xs">
                      <Badge tone={STATUS_TONE[c.from as keyof typeof STATUS_TONE]}>{c.from.replace("_", " ")}</Badge>→
                      <Badge tone={STATUS_TONE[c.to as keyof typeof STATUS_TONE]}>{c.to.replace("_", " ")}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}

function GradingForm({ value: p, onChange, disabled }: { value: GradingParams; onChange: (v: Record<string, unknown>) => void; disabled: boolean }) {
  const bands = useMemo(() => [...p.bands].sort((a, b) => b.min - a.min), [p.bands]);
  const setBand = (i: number, patch: Partial<GradingParams["bands"][number]>) => onChange({ ...p, bands: bands.map((b, j) => (i === j ? { ...b, ...patch } : b)) });
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2 bg-muted/60 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
          <span>Min marks %</span><span>Grade</span><span>Grade point</span><span>Description</span><span />
        </div>
        {bands.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] items-center gap-2 border-t border-border px-3 py-2">
            <Input type="number" value={b.min} disabled={disabled} onChange={(e) => setBand(i, { min: num(e.target.value) })} />
            <Input value={b.grade} disabled={disabled} onChange={(e) => setBand(i, { grade: e.target.value })} />
            <Input type="number" value={b.point} disabled={disabled} onChange={(e) => setBand(i, { point: num(e.target.value) })} />
            <Input value={b.label} disabled={disabled} onChange={(e) => setBand(i, { label: e.target.value })} />
            <button disabled={disabled} className="p-1 text-muted-foreground hover:text-red-600" onClick={() => onChange({ ...p, bands: bands.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-sm">
          <span>Below lowest band → <strong>{p.failGrade}</strong> ({p.failPoint} points)</span>
          {!disabled && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...p, bands: [...bands, { min: 0, grade: "?", point: 0, label: "" }] })}>
              <Plus className="h-3.5 w-3.5" /> Add band
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SGPA / CGPA decimal places">
          <Input type="number" value={p.rounding} disabled={disabled} onChange={(e) => onChange({ ...p, rounding: num(e.target.value) })} />
        </Field>
        <Field label="Minimum CGPA for award of degree">
          <Input type="number" step="0.1" value={p.degreeMinCgpa} disabled={disabled} onChange={(e) => onChange({ ...p, degreeMinCgpa: num(e.target.value) })} />
        </Field>
      </div>
      <Field label="Class / division (by CGPA)">
        <div className="space-y-2">
          {p.divisions.map((d, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr] gap-2">
              <Input type="number" step="0.1" value={d.minCgpa} disabled={disabled} onChange={(e) => onChange({ ...p, divisions: p.divisions.map((x, j) => (i === j ? { ...x, minCgpa: num(e.target.value) } : x)) })} />
              <Input value={d.label} disabled={disabled} onChange={(e) => onChange({ ...p, divisions: p.divisions.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)) })} />
            </div>
          ))}
        </div>
      </Field>
    </div>
  );
}

function GradingTester({ params }: { params: GradingParams }) {
  const [marks, setMarks] = useState(72);
  const g = gradeFor(params, marks);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Test grading</span>} />
      <CardBody className="flex items-end gap-4">
        <Field label="Marks (out of 100)">
          <Input type="number" value={marks} onChange={(e) => setMarks(num(e.target.value))} className="w-32" />
        </Field>
        <div className="pb-1 text-sm">
          Grade <Badge tone={g.point ? "green" : "red"}>{g.grade}</Badge> · {g.point} points · {g.label}
        </div>
      </CardBody>
    </Card>
  );
}

type RevaluationParams = { windowDays: number; feeRevaluation: number; feeScrutiny: number; minChangePct: number; allowDecrease: boolean; maxPapers: number };

function RevaluationForm({ value: p, onChange, disabled }: { value: RevaluationParams; onChange: (v: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (patch: Partial<RevaluationParams>) => onChange({ ...p, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Application window (days after publication)">
        <Input type="number" value={p.windowDays} disabled={disabled} onChange={(e) => set({ windowDays: num(e.target.value) })} />
      </Field>
      <Field label="Maximum papers per student per semester">
        <Input type="number" value={p.maxPapers} disabled={disabled} onChange={(e) => set({ maxPapers: num(e.target.value) })} />
      </Field>
      <Field label="Revaluation fee per paper (₹)">
        <Input type="number" value={p.feeRevaluation} disabled={disabled} onChange={(e) => set({ feeRevaluation: num(e.target.value) })} />
      </Field>
      <Field label="Scrutiny / re-totalling fee per paper (₹)">
        <Input type="number" value={p.feeScrutiny} disabled={disabled} onChange={(e) => set({ feeScrutiny: num(e.target.value) })} />
      </Field>
      <Field label="Adopt revised marks if change ≥ (% of maximum)" help="Smaller differences are treated as evaluator variance; original marks stand.">
        <Input type="number" value={p.minChangePct} disabled={disabled} onChange={(e) => set({ minChangePct: num(e.target.value) })} />
      </Field>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={p.allowDecrease} disabled={disabled} onChange={(e) => set({ allowDecrease: e.target.checked })} />
          Revised marks may also be lower than the original
        </label>
      </div>
    </div>
  );
}

function GraceForm({ value: p, onChange, disabled }: { value: GraceParams; onChange: (v: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (patch: Partial<GraceParams>) => onChange({ ...p, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={p.enabled} disabled={disabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Grace marks enabled
        </label>
      </div>
      <Field label="Maximum per course">
        <Input type="number" value={p.maxPerCourse} disabled={disabled || !p.enabled} onChange={(e) => set({ maxPerCourse: num(e.target.value) })} />
      </Field>
      <Field label="Maximum per semester">
        <Input type="number" value={p.maxPerSemester} disabled={disabled || !p.enabled} onChange={(e) => set({ maxPerSemester: num(e.target.value) })} />
      </Field>
      <Field label="Maximum number of courses">
        <Input type="number" value={p.maxCourses} disabled={disabled || !p.enabled} onChange={(e) => set({ maxCourses: num(e.target.value) })} />
      </Field>
      <Field label="Approving authority">
        <Select value={p.approvingAuthority} disabled={disabled || !p.enabled} onChange={(e) => set({ approvingAuthority: e.target.value })}>
          <option value="COE">Controller of Examinations</option>
          <option value="VC">Vice-Chancellor</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={p.onlyToPass} disabled={disabled || !p.enabled} onChange={(e) => set({ onlyToPass: e.target.checked })} />
          Apply only where it enables the candidate to reach the pass mark (never to improve a grade)
        </label>
      </div>
    </div>
  );
}
