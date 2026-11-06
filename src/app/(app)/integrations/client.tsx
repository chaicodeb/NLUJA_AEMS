"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, KeyRound, Play, RefreshCw, RotateCcw, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select } from "@/components/ui";
import { commitImportAction, createKeyAction, retryJobAction, revokeKeyAction, rollbackImportAction, runQueueAction, setOutageAction, stageImportAction } from "./actions";

type QueueResult = { error?: string; processed?: number; delivered?: number; retrying?: number; failed?: number };
const queueToast = (r: QueueResult) => {
  if (r.error) return void toast.error(r.error);
  if (!r.processed) return void toast.info("Nothing due in the queue");
  const msg = `${r.delivered} delivered to DigiLocker${r.retrying ? `, ${r.retrying} will be retried` : ""}${r.failed ? `, ${r.failed} failed` : ""}`;
  if (r.failed || r.retrying) toast.warning(msg);
  else toast.success(msg);
};

export function RunQueueButton({ pending: due }: { pending: number }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="accent" disabled={pending} onClick={() => start(async () => queueToast(await runQueueAction()))}>
      <Play className="h-4 w-4" /> Run queue now{due ? ` (${due} waiting)` : ""}
    </Button>
  );
}

export function RetryButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => queueToast(await retryJobAction(jobId)))}>
      <RefreshCw className="h-3.5 w-3.5" /> Retry
    </Button>
  );
}

export function OutageToggle({ code, on }: { code: string; on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setOutageAction(code, e.target.checked);
            toast.success(e.target.checked ? "Simulated outage on — deliveries will fail and be retried with back-off" : "Simulated outage off");
          })
        }
      />
      Simulate outage (testing)
    </label>
  );
}

export function CreateKeyForm({ scopes }: { scopes: [string, string][] }) {
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>(["students:read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (secret)
    return (
      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="font-medium text-amber-900">Copy this key now — it is shown only once and stored only as a hash.</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs">{secret}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success("Copied"))}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>Done</Button>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="key-name">System using the key</Label>
        <Input id="key-name" placeholder="e.g. Samarth e-Governance, Library (Koha), Hostel ERP" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {scopes.map(([k, label]) => (
          <label key={k} className="inline-flex items-center gap-1.5" title={label}>
            <input type="checkbox" checked={chosen.includes(k)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, k] : c.filter((x) => x !== k)))} />
            <span className="font-mono text-xs">{k}</span>
          </label>
        ))}
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createKeyAction(name, chosen);
            if (r.error) return void toast.error(r.error);
            if ("secret" in r && r.secret) setSecret(r.secret);
            setName("");
          })
        }
      >
        <KeyRound className="h-4 w-4" /> Create key
      </Button>
    </div>
  );
}

export function RevokeKeyButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="border-red-200 text-red-700"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Revoke the key for "${name}"? Calls using it will be refused immediately.`)) return;
        start(async () => {
          const r = await revokeKeyAction(id);
          if (r.error) toast.error(r.error);
          else toast.success("Key revoked");
        });
      }}
    >
      <Ban className="h-3.5 w-3.5" /> Revoke
    </Button>
  );
}

export function TryIt({ examples }: { examples: { label: string; path: string }[] }) {
  const [key, setKey] = useState("");
  const [path, setPath] = useState(examples[0]?.path ?? "/api/v1/students");
  const [out, setOut] = useState<{ status: number; ms: number; body: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <Input placeholder="API key (nluja_…)" value={key} onChange={(e) => setKey(e.target.value)} aria-label="API key" className="font-mono text-xs" />
        <div className="flex gap-2">
          <Select className="w-44" value="" onChange={(e) => e.target.value && setPath(e.target.value)} aria-label="Example request">
            <option value="">Examples…</option>
            {examples.map((x) => <option key={x.path} value={x.path}>{x.label}</option>)}
          </Select>
          <Input value={path} onChange={(e) => setPath(e.target.value)} aria-label="Request path" className="font-mono text-xs" />
        </div>
        <Button
          disabled={pending || !path.startsWith("/api/v1/")}
          onClick={() =>
            start(async () => {
              const t = performance.now();
              const res = await fetch(path, { headers: key ? { Authorization: `Bearer ${key}` } : {}, credentials: "omit" });
              const text = await res.text();
              let body = text;
              try {
                body = JSON.stringify(JSON.parse(text), null, 2);
              } catch {
                // not JSON: show as received
              }
              setOut({ status: res.status, ms: Math.round(performance.now() - t), body });
            })
          }
        >
          <Send className="h-4 w-4" /> Send
        </Button>
      </div>
      {out && (
        <div className="rounded-lg border border-border">
          <div className={`flex justify-between border-b border-border px-3 py-1.5 text-xs font-medium ${out.status < 300 ? "bg-leaf-50 text-leaf-700" : "bg-red-50 text-red-700"}`}>
            <span>HTTP {out.status}</span>
            <span>{out.ms} ms</span>
          </div>
          <pre className="max-h-96 overflow-auto p-3 text-xs">{out.body}</pre>
        </div>
      )}
    </div>
  );
}

export function ImportUploader({ kinds }: { kinds: [string, string][] }) {
  const [kind, setKind] = useState(kinds[0][0]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const onFile = (file: File) =>
    start(async () => {
      if (file.size > 900_000) return void toast.error("The file is larger than 900 KB; split it into parts.");
      const r = await stageImportAction(kind, file.name, await file.text());
      if (r.error) return void toast.error(r.error);
      toast.success("File staged — review the reconciliation before committing");
      if ("id" in r) router.push(`/integrations/migration/${r.id}`);
    });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="imp-kind">What are you importing?</Label>
        <Select id="imp-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      <a href={`/api/integrations/sample/${kind.toLowerCase()}?template=1`} className="text-sm text-brand-700 hover:underline">Blank template</a>
      <a href={`/api/integrations/sample/${kind.toLowerCase()}`} className="text-sm text-brand-700 hover:underline">Demo legacy file</a>
      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 ${pending ? "opacity-60" : ""}`}>
        <Upload className="h-4 w-4" /> {pending ? "Checking…" : "Upload CSV"}
        <input type="file" accept=".csv,text/csv" className="hidden" disabled={pending} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} aria-label="CSV file to import" />
      </label>
    </div>
  );
}

export function CommitButton({ batchId, rows, skipped }: { batchId: string; rows: number; skipped: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="success"
      disabled={pending || rows === 0}
      onClick={() => {
        if (skipped && !window.confirm(`${skipped} row(s) with errors will be left out. Write the other ${rows}?`)) return;
        start(async () => {
          const r = await commitImportAction(batchId);
          if (r.error) toast.error(r.error);
          else toast.success(`${"written" in r ? r.written : rows} row(s) written to the live records`);
        });
      }}
    >
      <Check className="h-4 w-4" /> Commit {rows} clean row{rows === 1 ? "" : "s"}
    </Button>
  );
}

export function RollbackButton({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Remove every record this import created?")) return;
        start(async () => {
          const r = await rollbackImportAction(batchId);
          if (r.error) toast.error(r.error);
          else toast.success("Import rolled back");
        });
      }}
    >
      <RotateCcw className="h-4 w-4" /> Roll back
    </Button>
  );
}
