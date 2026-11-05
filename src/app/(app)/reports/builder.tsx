"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Play, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, CardHeader, Input, Label, Select } from "@/components/ui";
import type { Column, Dataset, Filter, ReportConfig, Row } from "@/lib/reports/datasets";
import { runReportAction, saveReportAction } from "./actions";

type Saved = { id: string; name: string; description: string | null; dataset: string; config: ReportConfig; author: string };

const OPS: { v: Filter["op"]; l: string }[] = [
  { v: "eq", l: "equals" }, { v: "neq", l: "not equals" }, { v: "lt", l: "less than" }, { v: "gt", l: "greater than" }, { v: "contains", l: "contains" },
];

function defaultConfig(ds: Dataset): ReportConfig {
  return { dataset: ds.key, columns: ds.columns.slice(0, 6).map((c) => c.key), filters: [] };
}

export function Builder({ datasets, saved, initial }: { datasets: Dataset[]; saved: Saved[]; initial?: ReportConfig }) {
  const [config, setConfig] = useState<ReportConfig>(initial ?? defaultConfig(datasets[0]));
  const [result, setResult] = useState<{ columns: Column[]; rows: Row[] } | null>(null);
  const [name, setName] = useState("");
  const [running, startRun] = useTransition();
  const [saving, startSave] = useTransition();
  const ds = datasets.find((d) => d.key === config.dataset)!;

  const run = (c = config) => startRun(async () => setResult(await runReportAction(c)));
  useEffect(() => {
    if (initial) run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const numeric = ds.columns.filter((c) => c.type === "number");

  const exportCsv = () => {
    if (!result) return;
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [result.columns.map((c) => esc(c.label)).join(","), ...result.rows.map((r) => result.columns.map((c) => esc(r[c.key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${(name || ds.label).replace(/\s+/g, "-").toLowerCase()}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="1. Dataset" />
          <CardBody className="space-y-2">
            <Select value={config.dataset} onChange={(e) => { const d = datasets.find((x) => x.key === e.target.value)!; setConfig(defaultConfig(d)); setResult(null); }}>
              {datasets.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground">{ds.description}</p>
            <div className="flex flex-wrap gap-1">{ds.modules.map((m) => <Badge key={m} tone="blue">{m}</Badge>)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="2. Columns" />
          <CardBody className="grid grid-cols-2 gap-1.5">
            {ds.columns.map((c) => (
              <label key={c.key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={config.columns.includes(c.key)}
                  onChange={(e) => set({ columns: e.target.checked ? [...config.columns, c.key] : config.columns.filter((x) => x !== c.key) })}
                />
                {c.label}
              </label>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="3. Filters" action={<Button size="sm" variant="ghost" onClick={() => set({ filters: [...config.filters, { column: ds.columns[0].key, op: "eq", value: "" }] })}><Plus className="h-3.5 w-3.5" /> Add</Button>} />
          <CardBody className="space-y-2">
            {config.filters.length === 0 && <p className="text-xs text-muted-foreground">No filters — all rows included.</p>}
            {config.filters.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_96px_1fr_auto] gap-1.5">
                <Select className="h-8 text-xs" value={f.column} onChange={(e) => set({ filters: config.filters.map((x, j) => (i === j ? { ...x, column: e.target.value } : x)) })}>
                  {ds.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
                <Select className="h-8 text-xs" value={f.op} onChange={(e) => set({ filters: config.filters.map((x, j) => (i === j ? { ...x, op: e.target.value as Filter["op"] } : x)) })}>
                  {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </Select>
                <Input className="h-8 text-xs" value={f.value} onChange={(e) => set({ filters: config.filters.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)) })} />
                <button className="text-muted-foreground hover:text-red-600" onClick={() => set({ filters: config.filters.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="4. Group & summarise (optional)" />
          <CardBody className="space-y-2">
            <Select value={config.groupBy ?? ""} onChange={(e) => set({ groupBy: e.target.value || undefined, aggregate: e.target.value ? config.aggregate ?? { fn: "count" } : undefined })}>
              <option value="">No grouping — list rows</option>
              {ds.columns.map((c) => <option key={c.key} value={c.key}>Group by {c.label}</option>)}
            </Select>
            {config.groupBy && (
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={config.aggregate?.fn ?? "count"} onChange={(e) => set({ aggregate: { fn: e.target.value as "count", column: config.aggregate?.column ?? numeric[0]?.key } })}>
                  <option value="count">Count</option>
                  <option value="avg">Average</option>
                  <option value="sum">Sum</option>
                </Select>
                {config.aggregate?.fn !== "count" && (
                  <Select value={config.aggregate?.column ?? ""} onChange={(e) => set({ aggregate: { fn: config.aggregate!.fn, column: e.target.value } })}>
                    {numeric.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Select>
                )}
              </div>
            )}
            {!config.groupBy && (
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={config.sort?.column ?? ""} onChange={(e) => set({ sort: e.target.value ? { column: e.target.value, dir: config.sort?.dir ?? "asc" } : undefined })}>
                  <option value="">Default order</option>
                  {ds.columns.map((c) => <option key={c.key} value={c.key}>Sort by {c.label}</option>)}
                </Select>
                <Select value={config.sort?.dir ?? "asc"} disabled={!config.sort} onChange={(e) => set({ sort: { column: config.sort!.column, dir: e.target.value as "asc" } })}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </Select>
              </div>
            )}
          </CardBody>
        </Card>
        <Button className="w-full" size="lg" onClick={() => run()} disabled={running}>
          <Play className="h-4 w-4" /> {running ? "Running…" : "Run report"}
        </Button>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={result ? `${result.rows.length} row(s)` : "Results"}
            description={ds.label}
            action={result && <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV / Excel</Button>}
          />
          <div className="max-h-[60vh] overflow-auto">
            {!result ? (
              <p className="p-6 text-sm text-muted-foreground">Configure the report on the left and press Run.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>{result.columns.map((c) => <th key={c.key} className={`px-3 py-2 ${c.type === "number" ? "text-right" : ""}`}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {result.columns.map((c) => <td key={c.key} className={`px-3 py-1.5 ${c.type === "number" ? "text-right tabular-nums" : ""}`}>{r[c.key] ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Save this report" description="Saved reports appear below for every authorised user" />
          <CardBody className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Report name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pass percentage by category (NAAC 2.6.3)" />
            </div>
            <Button
              disabled={saving}
              onClick={() => startSave(async () => {
                const r = await saveReportAction(name, "", config);
                if ("error" in r && r.error) toast.error(r.error);
                else { toast.success("Report saved"); setName(""); }
              })}
            >
              <Save className="h-4 w-4" /> Save
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Saved reports" />
          <ul className="divide-y divide-border">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{datasets.find((d) => d.key === s.dataset)?.label} · by {s.author}{s.description ? ` · ${s.description}` : ""}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setConfig(s.config); run(s.config); }}>Open</Button>
              </li>
            ))}
            {saved.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">No saved reports yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
