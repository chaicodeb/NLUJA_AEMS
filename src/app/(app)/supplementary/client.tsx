"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, CalendarPlus, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import { createSupplementaryAction, processSupplementaryAction, registerSupplementaryAction, saveAwardListAction } from "./actions";

export function CreateSupplementaryButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await createSupplementaryAction();
          if ("error" in r && r.error) toast.error(r.error);
          else toast.success("Supplementary examination created — registration is open to eligible students");
        })
      }
    >
      <CalendarPlus className="h-4 w-4" /> Create supplementary examination
    </Button>
  );
}

export function ProcessSupplementaryButton({ examId, disabled }: { examId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending || disabled}
      title={disabled ? "Submit every award list first" : undefined}
      onClick={() =>
        start(async () => {
          const r = await processSupplementaryAction(examId);
          if ("error" in r && r.error) toast.error(r.error);
          else if ("runId" in r) {
            toast.success("Supplementary results processed — send for verification");
            router.push(`/results/${r.runId}`);
          }
        })
      }
    >
      <Calculator className="h-3.5 w-3.5" /> {pending ? "Processing…" : "Process results"}
    </Button>
  );
}

type AwardRow = { id: string; rollNo: string; name: string; kind: string; marks: number | null; absent: boolean };

export function AwardListForm({ paperId, max, rows, locked }: { paperId: string; max: number; rows: AwardRow[]; locked: boolean }) {
  const [vals, setVals] = useState(Object.fromEntries(rows.map((r) => [r.id, { marks: r.marks == null ? "" : String(r.marks), absent: r.absent }])));
  const [pending, start] = useTransition();
  const entries = rows.map((r) => ({ registrationPaperId: r.id, marks: vals[r.id].marks.trim() === "" ? null : Number(vals[r.id].marks), absent: vals[r.id].absent }));
  const bad = entries.some((e) => !e.absent && e.marks != null && (Number.isNaN(e.marks) || e.marks < 0 || e.marks > max));
  const save = (submit: boolean) =>
    start(async () => {
      const r = await saveAwardListAction(paperId, entries, submit);
      if ("error" in r && r.error) toast.error(r.error);
      else toast.success(submit ? "Award list submitted and locked" : "Draft saved");
    });
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Roll No</th>
            <th className="px-4 py-2">Candidate</th>
            <th className="px-4 py-2">Attempt</th>
            <th className="px-4 py-2 text-right">End-semester / {max}</th>
            <th className="px-4 py-2 text-center">Absent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const v = vals[r.id];
            const n = v.marks.trim() === "" ? null : Number(v.marks);
            const invalid = !v.absent && n != null && (Number.isNaN(n) || n < 0 || n > max);
            return (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs">{r.rollNo}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-xs">{r.kind === "BACKLOG" ? "Backlog" : "Improvement"}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    inputMode="decimal"
                    disabled={locked || v.absent || pending}
                    value={v.absent ? "" : v.marks}
                    placeholder={v.absent ? "AB" : ""}
                    onChange={(e) => setVals((s) => ({ ...s, [r.id]: { ...s[r.id], marks: e.target.value } }))}
                    className={cn("h-8 w-20 rounded border border-border px-2 text-right disabled:bg-muted", invalid && "border-red-500 text-red-700")}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" disabled={locked || pending} checked={v.absent} onChange={(e) => setVals((s) => ({ ...s, [r.id]: { ...s[r.id], absent: e.target.checked } }))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!locked && (
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button size="sm" variant="outline" disabled={pending || bad} onClick={() => save(false)}>
            <Save className="h-3.5 w-3.5" /> Save draft
          </Button>
          <Button size="sm" disabled={pending || bad || entries.some((e) => !e.absent && e.marks == null)} onClick={() => save(true)}>
            <Send className="h-3.5 w-3.5" /> Submit award list
          </Button>
        </div>
      )}
    </div>
  );
}

type Option = { paperId: string; code: string; title: string; status: string; grade: string; total: number; max: number; kind: "BACKLOG" | "IMPROVEMENT" | null; reason: string };

export function SupplementaryRegistration({ examId, options, fee, maxImprovement }: { examId: string; options: Option[]; fee: number; maxImprovement: number }) {
  const t = useT();
  const [chosen, setChosen] = useState<string[]>(options.filter((o) => o.kind === "BACKLOG").map((o) => o.paperId));
  const [method, setMethod] = useState("UPI");
  const [pending, start] = useTransition();
  const improvements = options.filter((o) => o.kind === "IMPROVEMENT" && chosen.includes(o.paperId)).length;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {options.map((o) => (
          <li key={o.code} className={cn("flex items-start gap-3 px-4 py-2.5 text-sm", !o.kind && "opacity-60")}>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-brand-600"
              disabled={!o.kind || pending}
              checked={chosen.includes(o.paperId)}
              onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.paperId] : c.filter((x) => x !== o.paperId)))}
              aria-label={o.code}
            />
            <div className="flex-1">
              <div><span className="font-mono text-xs text-muted-foreground">{o.code}</span> {o.title}</div>
              <div className="text-xs text-muted-foreground">{t("Regular result: {total}/{max} · {grade} — {reason}", { total: o.total, max: o.max, grade: o.grade, reason: o.reason })}</div>
            </div>
            {o.kind && <span className={cn("rounded px-2 py-0.5 text-xs font-medium", o.kind === "BACKLOG" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900")}>{o.kind === "BACKLOG" ? t("Backlog") : t("Improvement")}</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-44" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="UPI">{t("Pay by UPI")}</option>
          <option value="NETBANKING">{t("Net banking")}</option>
          <option value="CARD">{t("Debit / credit card")}</option>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("{n} paper(s) · fee ₹{fee}", { n: chosen.length, fee: chosen.length * fee })}
          {improvements > maxImprovement && <span className="text-red-700">{t(" · at most {n} improvement papers", { n: maxImprovement })}</span>}
        </span>
        <Button
          className="ml-auto"
          disabled={pending || !chosen.length || improvements > maxImprovement}
          onClick={() =>
            start(async () => {
              const r = await registerSupplementaryAction(examId, chosen, method);
              if ("error" in r && r.error) toast.error(t.loose(r.error));
              else toast.success(t("Registered — ₹{fee} paid. Hall ticket will be issued before the examination.", { fee: "fee" in r ? (r.fee ?? 0) : 0 }));
            })
          }
        >
          <Send className="h-4 w-4" /> {t("Pay & register")}
        </Button>
      </div>
    </div>
  );
}
