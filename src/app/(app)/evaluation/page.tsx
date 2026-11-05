import Link from "next/link";
import { EyeOff } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const TONE = { ASSIGNED: "amber", IN_PROGRESS: "blue", LOCKED: "green" } as const;

export default async function MyEvaluationsPage() {
  const user = await requirePage("/evaluation");
  // Deliberately never selects the student relation: evaluators work on dummy numbers only.
  const evals = await db.evaluation.findMany({
    where: { evaluatorId: user.id },
    select: {
      id: true, round: true, status: true, total: true, submittedAt: true,
      script: { select: { dummyNo: true, examPaper: { select: { id: true, maxMarks: true, evaluationMode: true, course: { select: { code: true, title: true } } } } } },
    },
    orderBy: [{ status: "asc" }, { script: { dummyNo: "asc" } }],
  });
  const papers = Array.from(new Map(evals.map((e) => [e.script.examPaper.id, e.script.examPaper])).values());
  const pending = evals.filter((e) => e.status !== "LOCKED").length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="On-screen evaluation" title="My evaluations" description="Answer scripts allocated to you, identified only by barcode and dummy number." />
      <Callout tone="blue" title="Anonymous evaluation">
        <span className="inline-flex items-center gap-1.5">
          <EyeOff className="h-4 w-4" /> Candidate identity is masked from the point of scanning until results are decoded by the Controller of Examinations.
        </span>
      </Callout>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Allocated" value={evals.length} tone="brand" />
        <Stat label="Pending" value={pending} tone={pending ? "amber" : "green"} />
        <Stat label="Submitted & locked" value={evals.length - pending} tone="green" />
      </div>
      {evals.length === 0 && <EmptyState title="No scripts allocated" description="Scripts appear here once the Examination Branch scans and allocates them." />}
      {papers.map((p) => {
        const list = evals.filter((e) => e.script.examPaper.id === p.id);
        return (
          <Card key={p.id}>
            <CardHeader
              title={<><span className="font-mono text-sm text-muted-foreground">{p.course.code}</span> {p.course.title}</>}
              description={`${list.length} script(s) · maximum ${p.maxMarks} marks · ${p.evaluationMode === "DOUBLE" ? "double (blind) evaluation" : "single evaluation"}`}
              action={<Badge tone={list.some((e) => e.status !== "LOCKED") ? "amber" : "green"}>{list.filter((e) => e.status !== "LOCKED").length} pending</Badge>}
            />
            <Table>
              <THead>
                <tr>
                  <TH>Dummy No.</TH>
                  <TH>Round</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Marks</TH>
                  <TH>Submitted</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {list.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-mono font-semibold">{e.script.dummyNo}</TD>
                    <TD>{e.round}</TD>
                    <TD><Badge tone={TONE[e.status as keyof typeof TONE] ?? "neutral"}>{e.status.replace("_", " ")}</Badge></TD>
                    <TD className="text-right">{e.total ?? "—"}</TD>
                    <TD className="text-xs">{e.submittedAt ? formatDate(e.submittedAt, true) : "—"}</TD>
                    <TD className="text-right">
                      <Link href={`/evaluation/${e.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        {e.status === "LOCKED" ? "View" : "Evaluate"}
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
