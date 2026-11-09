import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { leaveFacts } from "@/lib/attendance/daily";
import { workflowViews } from "@/lib/workflow/engine";
import { WorkflowProgress, canActOn } from "@/components/workflow-progress";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { LeaveDecision } from "./client";

const STATUS = { PENDING: { label: "Pending", tone: "amber" }, APPROVED: { label: "Approved", tone: "green" }, REJECTED: { label: "Rejected", tone: "red" } } as const;

export default async function LeavePage() {
  const user = await requirePage("/attendance/leave");
  const leaves = await db.leaveRequest.findMany({ include: { student: { include: { batch: true } } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }] });
  const deciders = await db.user.findMany({ where: { id: { in: leaves.map((l) => l.decidedById ?? "") } } });
  const views = await workflowViews("LEAVE", leaves.map((l) => ({ id: l.id, facts: leaveFacts(l) })));
  const ordered = [...leaves.filter((l) => l.status === "PENDING"), ...leaves.filter((l) => l.status !== "PENDING")];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="Leave applications"
        description="Students apply online with supporting documents. Approved duty leave (University representation) is counted as attendance; approved medical leave is recorded against the classes missed and supports a relaxation request."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pending" value={leaves.filter((l) => l.status === "PENDING").length} tone="amber" />
        <Stat label="Approved" value={leaves.filter((l) => l.status === "APPROVED").length} tone="green" />
        <Stat label="Class records adjusted" value={leaves.reduce((a, l) => a + l.sessions, 0)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Approval steps follow the University&apos;s configured workflow — see <Link href="/workflows/LEAVE" className="text-brand-700 hover:underline">Workflow Designer → Student leave application</Link>.
      </p>
      {ordered.length === 0 ? (
        <EmptyState title="No leave applications" />
      ) : (
        <div className="space-y-4">
          {ordered.map((l) => {
            const view = views.get(l.id)!;
            const step = view.steps[view.current];
            return (
              <Card key={l.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={l.type === "DUTY" ? "blue" : "violet"}>{l.type === "DUTY" ? "Duty leave" : "Medical leave"}</Badge>
                      {l.student.name}
                      <span className="font-mono text-xs text-muted-foreground">{l.student.rollNo} · {l.student.batch.code}</span>
                    </span>
                  }
                  description={`${formatDate(l.fromDate)} – ${formatDate(l.toDate)} · ${leaveFacts(l).days} day(s) · applied ${formatDate(l.createdAt, true)}`}
                  action={<Badge tone={STATUS[l.status as keyof typeof STATUS].tone}>{STATUS[l.status as keyof typeof STATUS].label}</Badge>}
                />
                <div className="space-y-3 px-5 py-4 text-sm">
                  <p>{l.reason}</p>
                  {l.document && <p className="text-xs text-muted-foreground">Supporting document: <span className="font-mono">{l.document}</span></p>}
                  {(l.status === "PENDING" || view.actions.length > 0) && <WorkflowProgress view={view} />}
                  {l.status === "PENDING" && canActOn(view, user) && <LeaveDecision leaveId={l.id} type={l.type} stepName={step.name} />}
                  {l.status !== "PENDING" && (
                    <Callout tone={l.status === "APPROVED" ? "green" : "red"}>
                      {l.status === "APPROVED" ? `Approved — ${l.sessions} class record(s) marked as ${l.type === "DUTY" ? "duty leave (counted as present)" : "medical leave"}` : "Rejected"}
                      {l.decisionNote ? ` · ${l.decisionNote}` : ""} · {deciders.find((d) => d.id === l.decidedById)?.name} · {l.decidedAt ? formatDate(l.decidedAt, true) : ""}
                    </Callout>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
