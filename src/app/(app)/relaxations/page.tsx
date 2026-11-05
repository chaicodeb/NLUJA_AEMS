import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardHeader, Callout, PageHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DecisionButtons } from "./decision-buttons";

export default async function RelaxationsPage() {
  const user = await requirePage("/relaxations");
  const requests = await db.relaxationRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { student: { include: { batch: true } }, enrolment: { include: { course: true, attendance: true, eligibilities: true } }, exam: true },
  });
  const users = await db.user.findMany({ where: { id: { in: requests.flatMap((r) => [r.requestedById ?? "", r.decidedById ?? ""]) } } });
  const leaves = await db.leaveRequest.findMany({ where: { studentId: { in: requests.map((r) => r.studentId) }, type: "MEDICAL", status: "APPROVED" } });
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? "—";
  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance relaxation"
        title="Relaxation requests"
        description="Requests are raised by the Academic Section for students who fall within the relaxation band of the active rule. Only the authority named in that rule can decide them; the decision updates exam eligibility immediately."
      />
      {user.role === "VC" && pending.length > 0 && (
        <Callout tone="amber" title={`${pending.length} request(s) awaiting your decision`}>
          Each request shows the student&apos;s course and aggregate attendance against the configured conditions.
        </Callout>
      )}
      <Card>
        <CardHeader title="Pending" />
        {pending.length === 0 ? (
          <div className="p-5"><EmptyState title="No pending requests" /></div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => {
              const elig = r.enrolment.eligibilities.find((e) => e.examId === r.examId);
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {r.student.name} <span className="font-mono text-xs text-muted-foreground">{r.student.rollNo}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-mono text-xs">{r.enrolment.course.code}</span> {r.enrolment.course.title}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge tone="red">Course {elig?.coursePct.toFixed(2)}%</Badge>
                      <Badge tone="green">Aggregate {elig?.aggregatePct.toFixed(2)}%</Badge>
                      <Badge>{r.ground}</Badge>
                    </div>
                    <p className="max-w-xl text-sm text-muted-foreground">{r.remarks}</p>
                    {leaves.filter((l) => l.studentId === r.studentId).map((l) => (
                      <p key={l.id} className="text-xs text-sky-800">
                        Evidence: medical leave {formatDate(l.fromDate)} – {formatDate(l.toDate)} approved {l.decidedAt ? formatDate(l.decidedAt) : ""}
                        {r.enrolment.attendance?.medicalLeaveDays ? ` · ${r.enrolment.attendance.medicalLeaveDays} ${r.enrolment.course.code} class(es) missed on medical leave` : ""}
                        {l.document ? ` · ${l.document}` : ""}
                      </p>
                    ))}
                    <p className="text-xs text-muted-foreground">Raised by {name(r.requestedById)} · {formatDate(r.createdAt, true)}</p>
                  </div>
                  <DecisionButtons id={r.id} canDecide={user.role === "VC"} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {decided.length > 0 && (
        <Card>
          <CardHeader title="Decided" />
          <ul className="divide-y divide-border">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <span className="font-medium">{r.student.name}</span> · <span className="font-mono text-xs">{r.enrolment.course.code}</span>
                  {r.decisionNote && <span className="text-muted-foreground"> — {r.decisionNote}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={r.status === "APPROVED" ? "green" : "red"}>{r.status}</Badge>
                  {name(r.decidedById)} · {r.decidedAt && formatDate(r.decidedAt, true)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
