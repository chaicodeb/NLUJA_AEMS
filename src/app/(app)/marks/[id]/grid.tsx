"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Save, Signature } from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, Card, CardHeader, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { markProblem, sheetStats, type RowError, type RowInput, type SheetRow, type SubCriterion } from "@/lib/marks/shared";
import { importSheetAction, saveDraftAction, submitSheetAction } from "../actions";

type Cell = { marks: string; absent: boolean; detail: Record<string, string> };

const str = (v: number | null | undefined) => (v == null ? "" : String(v));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function MarksGrid({
  sheetId, max, passMarks, criteria, rows, editable,
}: { sheetId: string; max: number; passMarks: number | null; criteria: SubCriterion[]; rows: SheetRow[]; editable: boolean }) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.enrolmentId, { marks: str(r.marks), absent: r.absent, detail: Object.fromEntries(criteria.map((c) => [c.code, str(r.detail?.[c.code])])) }])) as Record<string, Cell>,
    [rows, criteria],
  );
  const [cells, setCells] = useState(initial);
  const [serverErrors, setServerErrors] = useState<RowError[]>([]);
  const [importProblems, setImportProblems] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(cells) !== JSON.stringify(initial);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const inputs: RowInput[] = rows.map((r) => {
    const c = cells[r.enrolmentId];
    const detail = criteria.length ? Object.fromEntries(criteria.map((k) => [k.code, num(c.detail[k.code])])) : null;
    const parts = detail ? Object.values(detail) : [];
    const marks = criteria.length ? (parts.every((v) => v != null) ? parts.reduce<number>((a, v) => a + (v ?? 0), 0) : null) : num(c.marks);
    return { enrolmentId: r.enrolmentId, absent: c.absent, marks: c.absent ? null : marks, detail: c.absent ? null : detail };
  });
  const stats = sheetStats(inputs, max, passMarks);
  const missing = inputs.filter((r) => !r.absent && r.marks == null).length;
  const clientErrors = inputs.filter((r) => !r.absent && (markProblem(r.marks, max) || criteria.some((c) => markProblem(r.detail?.[c.code] ?? null, c.max)))).length;

  const update = (id: string, patch: Partial<Cell>) => {
    setCells((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
    setServerErrors((e) => e.filter((x) => x.enrolmentId !== id));
  };
  const focusNext = (row: number, col: number) => (document.querySelector(`[data-cell="${row + 1}-${col}"]`) as HTMLInputElement | null)?.focus();

  const save = () =>
    start(async () => {
      const r = await saveDraftAction(sheetId, inputs);
      if ("error" in r && r.error) {
        toast.error(r.error);
        setServerErrors(r.rowErrors ?? []);
      } else {
        toast.success(`Draft saved${"saved" in r ? ` — ${r.saved} change(s)` : ""}`);
        router.refresh();
      }
    });
  const submit = () =>
    start(async () => {
      const r = await submitSheetAction(sheetId, inputs);
      setConfirming(false);
      if ("error" in r && r.error) {
        toast.error(r.error);
        if ("rowErrors" in r) setServerErrors(r.rowErrors ?? []);
      } else {
        toast.success("Submitted and digitally signed — sent to the Dean for verification");
        router.refresh();
      }
    });
  const importFile = (file: File) =>
    start(async () => {
      const form = new FormData();
      form.set("file", file);
      const r = await importSheetAction(sheetId, form);
      if (fileRef.current) fileRef.current.value = "";
      if ("error" in r && r.error) {
        toast.error(r.error);
        setImportProblems(("problems" in r && r.problems) || []);
      } else {
        setImportProblems([]);
        toast.success(`Imported ${"imported" in r ? r.imported : 0} rows from Excel (${"changed" in r ? r.changed : 0} changed) — review, then submit`);
        router.refresh();
      }
    });

  const errorFor = (id: string) => serverErrors.filter((e) => e.enrolmentId === id).map((e) => e.message).join("; ");
  const col = criteria.length;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader
          title="Marks"
          description={editable ? `Out of ${max}${criteria.length ? " — total is the sum of the rubric criteria" : ""}; half marks allowed. Press Enter to move down.` : `Out of ${max}`}
          action={
            editable && (
              <div className="flex flex-wrap gap-2">
                <a href={`/marks/${sheetId}/template`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  <Download className="h-3.5 w-3.5" /> Excel template
                </a>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Import Excel
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              </div>
            )
          }
        />
        {importProblems.length > 0 && (
          <div className="px-5 pt-4">
            <Callout tone="red" title="The file was not imported">
              <ul className="list-disc pl-4">{importProblems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>
            </Callout>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Roll No</th>
                <th className="px-4 py-2">Student</th>
                {criteria.map((c) => (
                  <th key={c.code} className="px-2 py-2 text-center" title={c.name}>
                    {c.code}<div className="font-normal normal-case">/ {c.max}</div>
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Marks</th>
                <th className="px-4 py-2 text-center">Absent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => {
                const c = cells[r.enrolmentId];
                const inp = inputs[i];
                const problem = !inp.absent && markProblem(inp.marks, max);
                const err = errorFor(r.enrolmentId);
                const below = passMarks != null && inp.marks != null && inp.marks < passMarks;
                return (
                  <tr key={r.enrolmentId} className={cn(c.absent && "bg-muted/40", (problem || err) && "bg-red-50")}>
                    <td className="px-4 py-1.5 font-mono text-xs">{r.rollNo}</td>
                    <td className="px-4 py-1.5">
                      {r.name}
                      {err && <div className="text-xs text-red-700">{err}</div>}
                    </td>
                    {criteria.map((k, j) => {
                      const bad = !c.absent && markProblem(num(c.detail[k.code]), k.max);
                      return (
                        <td key={k.code} className="px-2 py-1.5 text-center">
                          {editable ? (
                            <input
                              data-cell={`${i}-${j}`}
                              inputMode="decimal"
                              disabled={c.absent || pending}
                              value={c.detail[k.code]}
                              onChange={(e) => update(r.enrolmentId, { detail: { ...c.detail, [k.code]: e.target.value } })}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), focusNext(i, j))}
                              className={cn("h-8 w-14 rounded border border-border bg-white px-1 text-center disabled:bg-muted", bad && "border-red-500 text-red-700")}
                            />
                          ) : (
                            <span>{c.detail[k.code] || "—"}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-1.5 text-right">
                      {editable && !criteria.length ? (
                        <input
                          data-cell={`${i}-${col}`}
                          inputMode="decimal"
                          disabled={c.absent || pending}
                          value={c.absent ? "" : c.marks}
                          placeholder={c.absent ? "AB" : ""}
                          onChange={(e) => update(r.enrolmentId, { marks: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), focusNext(i, col))}
                          className={cn("h-8 w-20 rounded border border-border bg-white px-2 text-right font-medium disabled:bg-muted", (problem || err) && "border-red-500 text-red-700", below && !problem && "text-amber-700")}
                        />
                      ) : (
                        <span className={cn("font-medium", below && "text-amber-700", problem && "text-red-700")}>{c.absent ? "AB" : inp.marks ?? "—"}</span>
                      )}
                      {problem && <div className="text-[11px] text-red-700">{problem}</div>}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={c.absent}
                        disabled={!editable || pending}
                        onChange={(e) => update(r.enrolmentId, { absent: e.target.checked })}
                        aria-label={`${r.name} absent`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="space-y-3 border-t border-border px-5 py-4">
            {confirming ? (
              <Callout tone="amber" title={`Submit ${stats.total} marks for verification?`}>
                <p>The sheet will be signed with your credentials and locked. Any later correction needs the Dean to return it to you.</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="success" disabled={pending} onClick={submit}>
                    <Signature className="h-3.5 w-3.5" /> {pending ? "Signing…" : "Confirm & sign"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
                </div>
              </Callout>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {missing ? `${missing} student(s) without marks` : "All students have marks"}
                  {clientErrors ? ` · ${clientErrors} invalid` : ""}
                  {dirty ? " · unsaved changes" : ""}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" disabled={pending || !dirty || clientErrors > 0} onClick={save}>
                    <Save className="h-3.5 w-3.5" /> Save draft
                  </Button>
                  <Button size="sm" disabled={pending || missing > 0 || clientErrors > 0} onClick={() => setConfirming(true)}>
                    <Signature className="h-3.5 w-3.5" /> Submit & sign
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="h-fit">
        <CardHeader title="Sheet statistics" description={editable ? "Updates as you type" : "Of the marks as submitted"} />
        <div className="space-y-4 px-5 py-4 text-sm">
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Entered</span><span>{stats.entered}/{stats.total}</span></div>
            <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-leaf-600" style={{ width: `${(stats.entered / Math.max(1, stats.total)) * 100}%` }} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Mean", stats.mean], ["Lowest", stats.min], ["Highest", stats.max]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-muted/50 py-2">
                <div className="text-[11px] text-muted-foreground">{l}</div>
                <div className="text-lg font-semibold">{v ?? "—"}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Distribution (% of maximum)</div>
            <div className="flex h-24 items-end gap-1.5">
              {stats.bins.map((b, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-brand-400" style={{ height: `${(b / Math.max(1, ...stats.bins)) * 72}px` }} />
                  <span className="text-[10px] text-muted-foreground">{i * 20}–{i * 20 + 20}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Absent: <span className="font-medium text-foreground">{stats.absent}</span></div>
            {passMarks != null && <div>Below component minimum ({passMarks}): <span className={cn("font-medium", stats.belowPass ? "text-amber-700" : "text-foreground")}>{stats.belowPass}</span></div>}
          </div>
        </div>
      </Card>
    </div>
  );
}
