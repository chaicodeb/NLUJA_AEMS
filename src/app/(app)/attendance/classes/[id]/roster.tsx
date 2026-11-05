"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, FingerprintPattern, Save, Siren } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Callout, Card, CardHeader, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LEVEL_INFO, RECORD_STATUS, countsAsPresent, levelFor, type AlertLevel } from "@/lib/attendance/shared";
import { fetchBiometricAction, markSessionAction } from "../../actions";

type Row = { enrolmentId: string; rollNo: string; name: string; status: string; leave: string | null; held: number; attended: number };
type Raised = { name: string; code: string; pct: number; level: AlertLevel };

export function Roster({
  sessionId, rows, marked, canEdit, needsReason, minPct, floorPct, originals,
}: { sessionId: string; rows: Row[]; marked: boolean; canEdit: boolean; needsReason: boolean; minPct: number; floorPct: number | null; originals: Record<string, string> }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.enrolmentId, r.status])));
  const [punches, setPunches] = useState<Record<string, string | null> | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [raised, setRaised] = useState<Raised[] | null>(null);
  const [pending, start] = useTransition();
  const editable = canEdit;
  const dirty = !marked || rows.some((r) => statuses[r.enrolmentId] !== r.status);
  const present = rows.filter((r) => countsAsPresent(statuses[r.enrolmentId])).length;

  /** Course percentage once this class is saved with the chosen status. */
  const projected = (r: Row) => {
    const now = statuses[r.enrolmentId];
    const orig = originals[r.enrolmentId];
    const held = orig ? r.held : r.held + 1;
    const attended = r.attended - (orig && countsAsPresent(orig) ? 1 : 0) + (countsAsPresent(now) ? 1 : 0);
    return { before: r.held ? (r.attended / r.held) * 100 : null, after: held ? (attended / held) * 100 : 100 };
  };

  const fetchBiometric = () =>
    start(async () => {
      const res = await fetchBiometricAction(sessionId);
      if ("error" in res && res.error) return void toast.error(res.error);
      if (!("punches" in res) || !res.punches) return;
      setStatuses(Object.fromEntries(res.punches.map((p) => [p.enrolmentId, p.status])));
      setPunches(Object.fromEntries(res.punches.map((p) => [p.enrolmentId, p.punchedAt])));
      setDevice(res.device ?? null);
      toast.success(`Punch log received — ${res.punches.filter((p) => p.punchedAt).length}/${res.punches.length} students punched in. Review, then save.`);
    });

  const save = () =>
    start(async () => {
      const res = await markSessionAction(sessionId, rows.map((r) => ({ enrolmentId: r.enrolmentId, status: statuses[r.enrolmentId] })), punches ? "BIOMETRIC" : "FACULTY", reason);
      if ("error" in res && res.error) return void toast.error(res.error);
      if ("alerts" in res) {
        setRaised(res.alerts ?? []);
        toast.success(`Attendance saved — ${res.present} present, ${res.absent} absent${res.alerts?.length ? `; ${res.alerts.length} alert(s) sent` : ""}`);
      }
      setReason("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {raised && raised.length > 0 && (
        <Callout tone="red" title={`${raised.length} attendance alert${raised.length === 1 ? "" : "s"} sent to students and parents (SMS + e-mail)`}>
          <ul className="mt-1 space-y-0.5">
            {raised.map((a) => (
              <li key={a.name + a.code}>
                <strong>{a.name}</strong> — {a.code} now {a.pct.toFixed(1)}% · {LEVEL_INFO[a.level].label.toLowerCase()}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {raised && raised.length === 0 && <Callout tone="green" title="Attendance saved">No student crossed a warning threshold.</Callout>}

      <Card>
        <CardHeader
          title={`Roll — ${rows.length} students`}
          description={device ? `Pre-filled from ${device}. Confirm or override each student before saving.` : marked ? "Saved record. Change a status and save to correct it." : "Everyone starts as present — tap the absentees, or fetch the biometric punch log."}
          action={
            editable && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={fetchBiometric}>
                  <FingerprintPattern className="h-3.5 w-3.5" /> Fetch biometric punches
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatuses(Object.fromEntries(rows.map((r) => [r.enrolmentId, r.leave ? statuses[r.enrolmentId] : "PRESENT"])))}>
                  <CheckCheck className="h-3.5 w-3.5" /> All present
                </Button>
              </div>
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Roll No</th>
                <th className="px-4 py-2">Student</th>
                {punches && <th className="px-4 py-2">Punch</th>}
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Course attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const st = statuses[r.enrolmentId];
                const { before, after } = projected(r);
                const level = levelFor(after, minPct, floorPct);
                const worse = before != null && levelFor(before, minPct, floorPct) !== level && after < before;
                const options = r.leave || st.endsWith("LEAVE") ? ["PRESENT", "ABSENT", r.leave?.startsWith("Medical") || st === "MEDICAL_LEAVE" ? "MEDICAL_LEAVE" : "DUTY_LEAVE"] : ["PRESENT", "ABSENT"];
                return (
                  <tr key={r.enrolmentId} className={cn(st === "ABSENT" && "bg-red-50/60")}>
                    <td className="px-4 py-2 font-mono text-xs">{r.rollNo}</td>
                    <td className="px-4 py-2">
                      {r.name}
                      {r.leave && <div className="text-[11px] text-sky-700">{r.leave}</div>}
                    </td>
                    {punches && <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{punches[r.enrolmentId] ?? "—"}</td>}
                    <td className="px-4 py-2">
                      <div className="inline-flex overflow-hidden rounded-md border border-border">
                        {options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            disabled={!editable || pending}
                            onClick={() => setStatuses((s) => ({ ...s, [r.enrolmentId]: o }))}
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed",
                              st === o ? (o === "PRESENT" ? "bg-leaf-600 text-white" : o === "ABSENT" ? "bg-red-600 text-white" : "bg-sky-600 text-white") : "bg-white hover:bg-muted",
                            )}
                            aria-pressed={st === o}
                          >
                            {RECORD_STATUS[o].label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className="text-muted-foreground">{before == null ? "—" : `${before.toFixed(1)}%`}</span>
                      {dirty && <> → <span className={cn("font-semibold", level === "OK" ? "text-leaf-700" : level === "WARNING" ? "text-amber-700" : "text-red-700")}>{after.toFixed(1)}%</span></>}
                      {level !== "OK" && (
                        <div className="mt-0.5">
                          <Badge tone={LEVEL_INFO[level].tone}>{worse && <Siren className="h-3 w-3" />}{LEVEL_INFO[level].label}</Badge>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="space-y-3 border-t border-border px-5 py-4">
            {needsReason && (
              <Textarea rows={2} placeholder="Reason for correcting a past class (e.g. student's biometric failed; verified with attendance sheet)" value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {present} present · {rows.length - present} absent
              </span>
              <Button className="ml-auto" disabled={pending || !dirty || (needsReason && reason.trim().length < 5)} onClick={save}>
                <Save className="h-4 w-4" /> {pending ? "Saving…" : marked ? (needsReason ? "Save correction" : "Save changes") : "Save attendance"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
