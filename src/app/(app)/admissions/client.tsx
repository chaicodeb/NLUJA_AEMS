"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleX, GraduationCap, Megaphone, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Textarea } from "@/components/ui";
import { publishMeritAction, rejectApplicationAction, respondToOfferAction, reviewDocumentAction, saveMarksAction } from "./actions";

type Result = { error?: string; ok?: boolean };
const report = (r: Result, success: string) => {
  if (r.error) toast.error(r.error);
  else toast.success(success);
};

export function DocumentReview({ docId, label }: { docId: string; label: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [remark, setRemark] = useState("");
  const [pending, start] = useTransition();
  const run = (decision: "ACCEPT" | "REJECT") =>
    start(async () => {
      const r = await reviewDocumentAction(docId, decision, remark);
      if (r.error) return void toast.error(r.error);
      const status = "status" in r ? r.status : undefined;
      toast.success(
        decision === "ACCEPT"
          ? status === "VERIFIED" ? `${label} accepted — all documents verified, application moves to the merit stage` : `${label} accepted`
          : `${label} returned to the applicant with your remark`,
      );
      setRejecting(false);
    });
  if (rejecting)
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
        <Input className="h-8 min-w-64 flex-1 text-xs" placeholder="What is wrong, and what should the applicant upload instead?" value={remark} onChange={(e) => setRemark(e.target.value)} aria-label={`Reason for rejecting ${label}`} />
        <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={pending} onClick={() => run("REJECT")}>
          Return to applicant
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
      </div>
    );
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="success" disabled={pending} onClick={() => run("ACCEPT")}>
        <Check className="h-3.5 w-3.5" /> Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
    </div>
  );
}

export function RejectApplicationForm({ applicationId, suggestion }: { applicationId: string; suggestion?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(suggestion ?? "");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => setOpen(true)}>
        <CircleX className="h-3.5 w-3.5" /> Reject application
      </Button>
    );
  return (
    <div className="w-full space-y-2">
      <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for rejecting the application" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={pending} onClick={() => start(async () => report(await rejectApplicationAction(applicationId, reason), "Application rejected; the applicant has been informed"))}>
          Confirm rejection
        </Button>
      </div>
    </div>
  );
}

type MarkRow = { id: string; appNo: string; name: string; category: string; values: Record<string, number | undefined>; qualified: boolean | null; relaxedNote: string };

export function MarksGrid({ cycleId, rows, components, locked }: { cycleId: string; rows: MarkRow[]; components: { code: string; label: string; max: number; testOnly: boolean }[]; locked: boolean }) {
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(components.map((c) => [c.code, r.values[c.code]?.toString() ?? ""]))])));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(values);
  const dirty = rows.filter((r) => components.some((c) => values[r.id][c.code] !== saved[r.id][c.code]));
  const save = () =>
    start(async () => {
      const entries = dirty.flatMap((r) => components.map((c) => ({ applicationId: r.id, code: c.code, value: values[r.id][c.code] === "" ? null : Number(values[r.id][c.code]) })));
      const r = await saveMarksAction(cycleId, entries);
      if (r.error) return void toast.error(r.error);
      setSaved(values);
      toast.success(`Marks saved for ${"changed" in r ? r.changed : dirty.length} candidate(s)`);
    });
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Application</th>
              <th className="px-4 py-2">Candidate</th>
              {components.map((c) => <th key={c.code} className="px-4 py-2 text-right">{c.label} <span className="normal-case">(/{c.max})</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{r.appNo}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.category}{r.relaxedNote}</div>
                </td>
                {components.map((c) => {
                  const off = !c.testOnly && r.qualified === false;
                  return (
                    <td key={c.code} className="px-4 py-2 text-right">
                      {off ? (
                        <span className="text-xs text-muted-foreground">Not called (below qualifying)</span>
                      ) : (
                        <Input
                          className={`ml-auto h-8 w-20 text-right ${values[r.id][c.code] === "" ? "border-amber-300 bg-amber-50" : ""}`}
                          inputMode="decimal"
                          disabled={locked}
                          value={values[r.id][c.code]}
                          onChange={(e) => setValues((v) => ({ ...v, [r.id]: { ...v[r.id], [c.code]: e.target.value.replace(/[^\d.]/g, "") } }))}
                          aria-label={`${c.label} for ${r.name}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">{dirty.length ? `${dirty.length} unsaved change(s)` : "All changes saved"}</span>
          <Button disabled={pending || !dirty.length} onClick={save}>
            <Save className="h-4 w-4" /> Save marks
          </Button>
        </div>
      )}
    </div>
  );
}

export function PublishMeritButton({ cycleId, offers }: { cycleId: string; offers: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="accent"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await publishMeritAction(cycleId);
          if (r.error) toast.error(r.error);
          else if ("offers" in r) toast.success(`Merit list published — ${r.offers} offers sent, ${r.waitlisted} waitlisted`);
        })
      }
    >
      <Megaphone className="h-4 w-4" /> Publish merit list & send {offers} offers
    </Button>
  );
}

export function UploadDocument({ code, label, replace }: { code: string; label: string; replace: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const upload = (file: File) =>
    start(async () => {
      const body = new FormData();
      body.set("code", code);
      body.set("file", file);
      const res = await fetch("/api/admissions/upload", { method: "POST", body });
      const r = (await res.json()) as Result;
      report(r, `${label} uploaded — the Academic Section will verify it`);
      if (!r.error) router.refresh();
      if (input.current) input.current.value = "";
    });
  return (
    <>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label={`Upload ${label}`} />
      <Button size="sm" variant={replace ? "default" : "outline"} disabled={pending} onClick={() => input.current?.click()}>
        <Upload className="h-3.5 w-3.5" /> {pending ? "Uploading…" : replace ? "Upload corrected file" : "Upload"}
      </Button>
    </>
  );
}

export function OfferResponse({ fee, seat }: { fee: number; seat: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="success"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await respondToOfferAction(true);
            if (r.error) return void toast.error(r.error);
            if ("rollNo" in r) toast.success(`Admission confirmed — Roll No. ${r.rollNo}, University ID ${r.uid}. Welcome to NLUJA!`);
            router.push("/dashboard");
          })
        }
      >
        <GraduationCap className="h-4 w-4" /> Accept {seat} seat & pay ₹{fee.toLocaleString("en-IN")}
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Decline the offer? The seat will go to the next candidate on the merit list and cannot be restored.")) return;
          start(async () => report(await respondToOfferAction(false), "Offer declined"));
        }}
      >
        Decline
      </Button>
    </div>
  );
}
