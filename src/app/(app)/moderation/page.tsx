import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { moderationOverview, resultsStarted, type PaperStat } from "@/lib/results/moderation";
import { Badge, Callout, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { DecideModeration, ProposeModeration } from "./client";

export const maxDuration = 120;

export default async function ModerationPage() {
  const user = await requirePage("/moderation");
  const exam = await db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" }, type: "REGULAR", status: { not: "PLANNED" } }, orderBy: { startDate: "desc" } });
  if (!exam) return <PageHeader title="Moderation" description="No examination found." />;
  const [{ cfg, rows }, locked] = await Promise.all([moderationOverview(exam.id), resultsStarted(exam.id)]);
  const people = await db.user.findMany({ where: { id: { in: rows.flatMap((r) => r.actions.flatMap((a) => [a.proposedById, a.decidedById ?? ""])) } } });
  const who = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const evaluated = rows.filter((r) => r.stat.n > 0);
  const flagged = evaluated.filter((r) => r.reasons.length);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Post-evaluation · pre-result"
        title="Moderation of papers"
        description="Paper-wise statistics are compared against the moderation rule. The Moderation Board may propose one uniform addition for a paper, within the rule's cap; it takes effect only after the Vice-Chancellor approves, and the evaluated marks are kept unchanged alongside it."
      />
      {cfg && (
        <Callout tone="blue" title={`Active rule ${cfg.rule.key} v${cfg.rule.version}`}>
          Flag when course pass rate &lt; {cfg.p.flagPassPctBelow}% or end-semester mean &lt; {cfg.p.flagMeanPctBelow}% · addition up to {cfg.p.maxAddPct}% of the paper · approved by {cfg.p.approvalAuthority === "VC" ? "the Vice-Chancellor" : cfg.p.approvalAuthority} · <Link href={`/rules/${cfg.rule.key}`} className="underline">edit rule</Link>
        </Callout>
      )}
      {locked && <Callout tone="amber" title="Results already processed">Moderation is closed for {exam.name}: marks can now change only through revaluation.</Callout>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Papers evaluated" value={`${evaluated.length}/${rows.length}`} />
        <Stat label="Flagged by the rule" value={flagged.length} tone={flagged.length ? "amber" : "green"} />
        <Stat label="Proposals awaiting approval" value={rows.flatMap((r) => r.actions).filter((a) => a.status === "PROPOSED").length} tone="brand" />
        <Stat label="Moderated papers" value={rows.filter((r) => r.actions.some((a) => a.status === "APPROVED")).length} tone="green" />
      </div>

      <Card>
        <CardHeader title={exam.name} description="End-semester marks of finalised scripts; course pass rate includes internal assessment" />
        <Table>
          <THead>
            <tr>
              <TH>Paper</TH>
              <TH className="text-right">Candidates</TH>
              <TH className="text-right">Mean</TH>
              <TH className="text-right">Std. dev.</TH>
              <TH className="text-right">Pass rate</TH>
              <TH>Moderation</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => {
              const latest = r.actions[0];
              return (
                <TR key={r.paperId} className={cn(r.reasons.length > 0 && !latest && "bg-amber-50/60")}>
                  <TD>
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span> <span className="text-sm">{r.title}</span>
                    {r.reasons.length > 0 && <div className="text-xs font-medium text-amber-800">Flagged: {r.reasons.join("; ")}</div>}
                  </TD>
                  <TD className="text-right tabular-nums">{r.stat.n || "—"}</TD>
                  <TD className="text-right tabular-nums">{r.stat.n ? <>{r.stat.mean}/{r.endMax} <span className="text-xs text-muted-foreground">({r.stat.meanPct}%)</span></> : "—"}</TD>
                  <TD className="text-right tabular-nums">{r.stat.n ? r.stat.sd : "—"}</TD>
                  <TD className={cn("text-right tabular-nums", r.stat.n && cfg && r.stat.passPct < cfg.p.flagPassPctBelow && "font-semibold text-red-700")}>{r.stat.n ? `${r.stat.passPct}%` : "—"}</TD>
                  <TD className="min-w-72">
                    {latest ? (
                      <ActionView action={latest} who={who} canDecide={!locked && latest.status === "PROPOSED" && user.role === cfg?.p.approvalAuthority} />
                    ) : !r.finalised ? (
                      <span className="text-xs text-muted-foreground">{r.scripts ? "Evaluation in progress" : "Not yet examined"}</span>
                    ) : !r.reasons.length ? (
                      <span className="text-xs text-leaf-700">Within range</span>
                    ) : user.role === "COE" && !locked ? (
                      <ProposeModeration examId={exam.id} paperId={r.paperId} maxAdd={r.maxAdd} flagged before={r.stat} />
                    ) : (
                      <span className="text-xs text-amber-800">Awaiting the Moderation Board</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function ActionView({ action, who, canDecide }: { action: { id: string; status: string; delta: number; reason: string; before: unknown; after: unknown; proposedById: string; proposedAt: Date; decidedById: string | null; decidedAt: Date | null; decisionNote: string | null }; who: (id: string | null) => string; canDecide: boolean }) {
  const before = action.before as PaperStat;
  const after = action.after as PaperStat & { newlyPassing?: string[] };
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={action.status === "APPROVED" ? "green" : action.status === "REJECTED" ? "red" : "amber"}>
          {action.status === "APPROVED" ? `Moderated +${action.delta}` : action.status === "REJECTED" ? "Proposal rejected" : `+${action.delta} proposed`}
        </Badge>
        <span>pass {before.passPct}% → <strong>{after.passPct}%</strong> · mean {before.meanPct}% → {after.meanPct}%</span>
      </div>
      {after.newlyPassing?.length ? <div className="text-muted-foreground">Newly passing: {after.newlyPassing.join(", ")}</div> : null}
      <div className="text-muted-foreground">&ldquo;{action.reason}&rdquo; — {who(action.proposedById)}, {formatDate(action.proposedAt, true)}</div>
      {action.decidedAt && <div className="text-muted-foreground">{action.status === "APPROVED" ? "Approved" : "Rejected"} by {who(action.decidedById)} · {formatDate(action.decidedAt, true)}{action.decisionNote ? ` · ${action.decisionNote}` : ""}</div>}
      {canDecide && <DecideModeration actionId={action.id} />}
    </div>
  );
}
