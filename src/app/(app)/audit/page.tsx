import { ShieldCheck, ShieldX } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { auditFilter, verifyAuditChain } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge, Card, Callout, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { JsonDiff } from "./json-diff";

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requirePage("/audit");
  const sp = await searchParams;
  const { action, who } = sp;
  const text = typeof sp.q === "string" ? sp.q.trim() : "";
  const filters = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1])).toString();
  const [logs, chain, actions, people] = await Promise.all([
    db.auditLog.findMany({
      where: auditFilter(sp),
      orderBy: { id: "desc" },
      take: 200,
      include: { actor: true },
    }),
    verifyAuditChain(),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="Every create, update, approval and access decision is recorded with the acting user, timestamp and before/after values. Entries are hash-chained, so any edit to history is detectable."
      />
      {chain.ok ? (
        <Callout tone="green" title="Chain verified">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> All {chain.total} entries recomputed — no tampering detected (SHA-256 hash chain).
          </span>
        </Callout>
      ) : (
        <Callout tone="red" title="Integrity failure">
          <span className="inline-flex items-center gap-1.5">
            <ShieldX className="h-4 w-4" /> Entry #{chain.brokenAt} does not match its recorded hash. The trail has been altered outside the application.
          </span>
        </Callout>
      )}
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <select name="action" defaultValue={action ? String(action) : ""} className="h-9 rounded-md border border-border px-3 text-sm">
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
          <select name="who" defaultValue={who ? String(who) : ""} className="h-9 max-w-full rounded-md border border-border px-3 text-sm" aria-label="Done by">
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {ROLE_LABELS[p.role]}</option>
            ))}
          </select>
          <input name="q" defaultValue={text} placeholder="Search: student name, roll no., code…" className="h-9 w-64 max-w-full rounded-md border border-border px-3 text-sm" aria-label="Search the audit trail" />
          <button className="h-9 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Filter</button>
          <a href={`/audit/export${filters ? `?${filters}` : ""}`} className="ml-auto text-sm font-medium text-brand-700 hover:underline">Export CSV{filters ? " (filtered)" : ""}</a>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>Details</TH>
              <TH>Hash</TH>
            </tr>
          </THead>
          <tbody>
            {logs.map((l) => (
              <TR key={l.id} className="align-top">
                <TD className="font-mono text-xs text-muted-foreground">{l.id}</TD>
                <TD className="whitespace-nowrap text-xs">{formatDate(l.at, true)}</TD>
                <TD>
                  <div className="font-medium">{l.actor?.name ?? "System"}</div>
                  <div className="text-xs text-muted-foreground">{l.actorRole ? ROLE_LABELS[l.actorRole as Role] : ""}</div>
                </TD>
                <TD>
                  <Badge tone={/DENIED|FAILED|REJECT/.test(l.action) ? "red" : /APPROVE|PUBLISH|LOCK/.test(l.action) ? "green" : "neutral"}>{l.action}</Badge>
                  <div className="mt-1 text-xs text-muted-foreground">{l.entity}</div>
                </TD>
                <TD className="max-w-xl">
                  <div>{l.summary}</div>
                  {(l.before || l.after) && <JsonDiff before={l.before} after={l.after} />}
                </TD>
                <TD className="font-mono text-[11px] text-muted-foreground" title={l.hash}>{l.hash.slice(0, 12)}…</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
