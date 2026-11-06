"use client";

import { useMemo, useState, useTransition } from "react";
import { CircleAlert, Megaphone, Save, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader, Input, Label, Select } from "@/components/ui";
import { SESSION_TIME, checkTimetable, openDays, type Session, type TimetableRules, type TimetableSlot } from "@/lib/exams/timetable-shared";
import { dayOf } from "@/lib/academics/calendar-shared";
import { proposeTimetableAction, publishTimetableAction, saveTimetableAction } from "./actions";

const label = (d: string) => dayOf(d).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

export function TimetableEditor(props: { examId: string; slots: TimetableSlot[]; rules: TimetableRules; locked: boolean; canEdit: boolean; canPublish: boolean; published: boolean }) {
  const [slots, setSlots] = useState(props.slots);
  const [rules, setRules] = useState(props.rules);
  const [from, setFrom] = useState(props.rules.from);
  const [to, setTo] = useState(props.rules.to);
  const [gap, setGap] = useState(props.rules.minGapDays);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const editable = props.canEdit && !props.locked;
  const liveRules = { ...rules, minGapDays: gap };
  const issues = useMemo(() => checkTimetable(slots, { ...rules, minGapDays: gap }), [slots, rules, gap]);
  const errors = issues.filter((i) => i.level === "error");
  const flagged = new Set(errors.flatMap((i) => i.courseIds));
  const days = openDays(liveRules);
  const groups = [...new Set(slots.map((s) => s.groupLabel))].sort();
  const dates = [...new Set(slots.filter((s) => s.date).map((s) => s.date!))].sort();

  const update = (courseId: string, patch: Partial<TimetableSlot>) => {
    setSlots((xs) => xs.map((s) => (s.courseId === courseId ? { ...s, ...patch } : s)));
    setDirty(true);
  };
  const generate = () =>
    start(async () => {
      const r = await proposeTimetableAction(props.examId, { from, to, gap });
      if ("error" in r && r.error) return void toast.error(r.error);
      if ("slots" in r && r.slots && r.rules) {
        setSlots(r.slots);
        setRules(r.rules);
        setDirty(true);
        const unplaced = r.slots.filter((s) => !s.date).length;
        if (unplaced) toast.warning(`${unplaced} paper(s) could not be placed — widen the window or reduce the rest days`);
        else toast.success(`${r.slots.length} papers scheduled across ${new Set(r.slots.map((s) => s.date)).size} days, avoiding Sundays and ${r.rules.closed.length} holiday(s)`);
      }
    });
  const save = () =>
    start(async () => {
      const r = await saveTimetableAction(props.examId, slots.map((s) => ({ courseId: s.courseId, date: s.date, session: s.session })), { from, to, gap });
      if (r.error) return void toast.error(r.error);
      setDirty(false);
      toast.success(`Timetable saved${"created" in r && r.created ? ` — ${r.created} examination papers created` : ""}${"moved" in r && r.moved ? ` — ${r.moved} rescheduled` : ""}`);
    });
  const publish = () =>
    start(async () => {
      const r = await publishTimetableAction(props.examId);
      if (r.error) toast.error(r.error);
      else toast.success("Date sheet published to students and staff");
    });

  return (
    <div className="space-y-6">
      {editable && (
        <Card>
          <CardHeader title="Generate" description="Places every batch's papers inside the window, skipping Sundays and the holidays on the academic calendar, one paper a day per batch with the chosen rest days between papers, and within seating capacity." />
          <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
            <div className="space-y-1">
              <Label htmlFor="tt-from">Window from</Label>
              <Input id="tt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tt-to">to</Label>
              <Input id="tt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tt-gap">Rest days between a batch&apos;s papers</Label>
              <Select id="tt-gap" value={gap} onChange={(e) => { setGap(Number(e.target.value)); setDirty(true); }}>
                {[0, 1, 2].map((g) => <option key={g} value={g}>{g === 0 ? "None (consecutive days)" : `At least ${g}`}</option>)}
              </Select>
            </div>
            <Button variant="accent" disabled={pending} onClick={generate}>
              <Sparkles className="h-4 w-4" /> Generate timetable
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Checks"
          description={`${slots.length} papers · ${days.length} working days in the window · seats per session: ${rules.capacity}${rules.closed.length ? ` · closed: ${rules.closed.map((c) => `${c.title} (${label(c.date)})`).join(", ")}` : ""}`}
          action={
            <Badge tone={errors.length ? "red" : issues.length ? "amber" : "green"}>
              {slots.every((s) => !s.date) ? "Not scheduled" : errors.length ? `${errors.length} problem(s)` : issues.length ? `${issues.length} warning(s)` : "No clashes"}
            </Badge>
          }
        />
        {issues.length > 0 && (
          <ul className="space-y-1 px-5 pb-4 text-sm">
            {issues.map((i, k) => (
              <li key={k} className={`flex items-start gap-2 ${i.level === "error" ? "text-red-700" : "text-amber-800"}`}>
                {i.level === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />} {i.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dates.length > 0 && (
        <Card>
          <CardHeader title="Date sheet" description="FN 10:00 am – 1:00 pm · AN 2:00 pm – 5:00 pm" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  {groups.map((g) => <th key={g} className="px-4 py-2">{g}</th>)}
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => (
                  <tr key={d} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{label(d)}</td>
                    {groups.map((g) => {
                      const here = slots.filter((s) => s.date === d && s.groupLabel === g);
                      return (
                        <td key={g} className="px-4 py-2">
                          {here.map((s) => (
                            <div key={s.courseId} className={`text-xs ${flagged.has(s.courseId) ? "font-semibold text-red-700" : ""}`}>
                              <span className="font-mono">{s.code}</span> <Badge tone={s.session === "FN" ? "blue" : "violet"}>{s.session}</Badge>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Papers" description={editable ? "Adjust any paper; the checks above update as you go." : props.locked ? "Seating has been generated — the timetable is locked." : "Read-only"} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Batch</th>
                <th className="px-4 py-2">Paper</th>
                <th className="px-4 py-2 text-right">Candidates</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Session</th>
              </tr>
            </thead>
            <tbody>
              {[...slots].sort((a, b) => a.group.localeCompare(b.group) || a.code.localeCompare(b.code, undefined, { numeric: true })).map((s) => (
                <tr key={s.courseId} className={`border-t border-border ${flagged.has(s.courseId) ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.groupLabel}</td>
                  <td className="px-4 py-2"><span className="font-mono text-xs">{s.code}</span> {s.title}</td>
                  <td className="px-4 py-2 text-right">{s.candidates}</td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <Select className="h-8 w-40" value={s.date ?? ""} onChange={(e) => update(s.courseId, { date: e.target.value || null, session: s.session ?? "FN" })} aria-label={`Date for ${s.code}`}>
                        <option value="">—</option>
                        {s.date && !days.includes(s.date) && <option value={s.date}>{label(s.date)} (closed)</option>}
                        {days.map((d) => <option key={d} value={d}>{label(d)}</option>)}
                      </Select>
                    ) : s.date ? label(s.date) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <Select className="h-8 w-32" value={s.session ?? ""} onChange={(e) => update(s.courseId, { session: (e.target.value || null) as Session | null })} aria-label={`Session for ${s.code}`}>
                        <option value="">—</option>
                        {(["FN", "AN"] as Session[]).map((x) => <option key={x} value={x}>{x} · {SESSION_TIME[x].label}</option>)}
                      </Select>
                    ) : s.session ? `${s.session} · ${SESSION_TIME[s.session].label}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(editable || props.canPublish) && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3">
            <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : props.published ? "Published" : "Saved"}</span>
            {editable && (
              <Button disabled={pending || !dirty || errors.length > 0} onClick={save}>
                <Save className="h-4 w-4" /> Save timetable
              </Button>
            )}
            {props.canPublish && !props.published && (
              <Button variant="success" disabled={pending || dirty || errors.length > 0 || slots.some((s) => !s.date)} onClick={publish}>
                <Megaphone className="h-4 w-4" /> Publish date sheet
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
