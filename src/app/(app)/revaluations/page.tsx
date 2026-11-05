import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { getActiveRule } from "@/lib/rules/store";
import { eligibleRevaluators, type RevaluationParams, type ScrutinyFindings } from "@/lib/results/revaluation";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, type BadgeTone } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AssignForm, DecideButton } from "./client";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PAID: { label: "Awaiting evaluator", tone: "amber" },
  ASSIGNED: { label: "Re-evaluation in progress", tone: "blue" },
  EVALUATED: { label: "Awaiting COE decision", tone: "violet" },
  DECIDED: { label: "Decided", tone: "green" },
};

export default async function RevaluationsPage() {
  const user = await requirePage("/revaluations");
  const rule = await getActiveRule("REVALUATION");
  const p = rule?.params as unknown as RevaluationParams | undefined;
  const order = Object.keys(STATUS);
  const requests = (await db.revaluationRequest.findMany({ include: { student: true }, orderBy: { createdAt: "desc" } })).sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );
  const evals = await db.evaluation.findMany({ where: { id: { in: requests.map((r) => r.evaluationId ?? "") } }, include: { evaluator: true } });
  const people = await db.user.findMany({ where: { id: { in: requests.map((r) => r.decidedById ?? "") } } });
  const candidates = Object.fromEntries(await Promise.all(requests.filter((r) => r.status === "PAID" && r.type === "REVALUATION").map(async (r) => [r.id, await eligibleRevaluators(r.scriptId)] as const)));
  const canAssign = ["COE", "EXAM_STAFF", "ADMIN"].includes(user.role);
  const canDecide = user.role === "COE";
  const count = (s: string) => requests.filter((r) => r.status === s).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Post-result"
        title="Revaluation & scrutiny"
        description="Students apply online after results are published. Scrutiny re-checks totals automatically; revaluation is a blind fresh evaluation by someone who neither set nor marked the paper. The Controller of Examinations decides under the configured rule, and amended results are re-issued automatically."
      />
      {p && (
        <Callout tone="blue" title={`Active rule ${rule!.key} v${rule!.version}`}>
          Window {p.windowDays} days after publication · fees ₹{p.feeRevaluation} / ₹{p.feeScrutiny} · revised marks adopted when the change is at least {p.minChangePct}% of the paper&apos;s maximum{p.allowDecrease ? " (up or down)" : " (increases only)"} · <Link href={`/rules/${rule!.key}`} className="underline">edit rule</Link>
        </Callout>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Awaiting evaluator" value={count("PAID")} tone="amber" />
        <Stat label="Being re-evaluated" value={count("ASSIGNED")} tone="brand" />
        <Stat label="Awaiting decision" value={count("EVALUATED")} tone={count("EVALUATED") ? "red" : "neutral"} />
        <Stat label="Decided" value={count("DECIDED")} tone="green" hint={`${requests.filter((r) => r.outcome === "REVISED").length} result(s) amended`} />
      </div>

      {requests.length === 0 ? (
        <EmptyState title="No applications yet" description="Applications appear here once students apply from the student portal after results are published." />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => {
            const ev = evals.find((e) => e.id === r.evaluationId);
            const findings = r.findings as unknown as ScrutinyFindings | null;
            const change = r.revisedMarks != null ? r.revisedMarks - r.originalMarks : null;
            const threshold = p ? (r.maxMarks * p.minChangePct) / 100 : null;
            return (
              <Card key={r.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.type === "REVALUATION" ? "violet" : "blue"}>{r.type === "REVALUATION" ? "Revaluation" : "Scrutiny"}</Badge>
                      <span className="font-mono text-sm">{r.courseCode}</span>
                      <span>{r.student.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.student.rollNo}</span>
                    </span>
                  }
                  description={`Applied ${formatDate(r.createdAt, true)} · fee ₹${r.fee} (${r.paymentRef})${r.reason ? ` · "${r.reason}"` : ""}`}
                  action={<Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>}
                />
                <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_1.3fr]">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground">Original</div>
                      <div className="text-xl font-semibold">{r.originalMarks}<span className="text-sm text-muted-foreground">/{r.maxMarks}</span></div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground">{r.type === "SCRUTINY" ? "Re-totalled" : "Revalued"}</div>
                      <div className="text-xl font-semibold">{r.revisedMarks ?? "—"}</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground">Change</div>
                      <div className={`text-xl font-semibold ${change && change > 0 ? "text-leaf-700" : change && change < 0 ? "text-red-700" : ""}`}>
                        {change == null ? "—" : `${change > 0 ? "+" : ""}${change}`}
                      </div>
                      {r.type === "REVALUATION" && threshold != null && <div className="text-[10px] text-muted-foreground">threshold ±{threshold}</div>}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {r.type === "SCRUTINY" && findings && (
                      <ul className="space-y-1">
                        {findings.checks.map((c, i) => (
                          <li key={i} className="flex items-start gap-2">
                            {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                            <span><span className="font-medium">{c.label}</span> <span className="text-muted-foreground">— {c.detail}</span></span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.type === "REVALUATION" && (
                      <p className="text-muted-foreground">
                        {ev ? <>Re-evaluator: <strong className="text-foreground">{ev.evaluator.name}</strong> (blind — original marks hidden) · {ev.status === "LOCKED" ? `submitted ${formatDate(ev.submittedAt!, true)}` : "in progress"}</> : "No re-evaluator assigned yet."}
                      </p>
                    )}
                    {r.status === "PAID" && r.type === "REVALUATION" && canAssign && candidates[r.id] && <AssignForm requestId={r.id} options={candidates[r.id]} />}
                    {r.status === "EVALUATED" && (canDecide ? <DecideButton requestId={r.id} label="Apply rule & decide" /> : <p className="text-xs text-muted-foreground">Awaiting decision by the Controller of Examinations.</p>)}
                    {r.status === "DECIDED" && (
                      <Callout tone={r.outcome === "REVISED" ? "green" : "blue"} title={r.outcome === "REVISED" ? "Result amended" : "Marks unchanged"}>
                        {r.outcomeNote} · {people.find((x) => x.id === r.decidedById)?.name} · {formatDate(r.decidedAt!, true)}
                      </Callout>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
