import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { getActiveRule } from "@/lib/rules/store";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ProcessButton } from "./results-client";

const RUN_TONE = { PROCESSED: "amber", APPROVED: "blue", PUBLISHED: "green", WITHDRAWN: "neutral" } as const;

export default async function ResultsPage() {
  const user = await requirePage("/results");
  const exam = await db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" } }, orderBy: { startDate: "desc" } });
  if (!exam) return <PageHeader title="Result processing" description="No examination found." />;

  const [eligCount, scripts, finalised, pendingEvals, thirdEvals, runs, grading, grace] = await Promise.all([
    db.eligibility.count({ where: { examId: exam.id } }),
    db.answerScript.count({ where: { examPaper: { examId: exam.id } } }),
    db.answerScript.count({ where: { examPaper: { examId: exam.id }, status: "FINALISED" } }),
    db.evaluation.count({ where: { script: { examPaper: { examId: exam.id } }, status: { not: "LOCKED" } } }),
    db.answerScript.count({ where: { examPaper: { examId: exam.id }, status: "THIRD_EVALUATION" } }),
    db.resultRun.findMany({ where: { examId: exam.id }, orderBy: { processedAt: "desc" } }),
    getActiveRule("GRADING"),
    getActiveRule("GRACE"),
  ]);
  const internals = await db.markEntry.count({ where: { component: { source: { not: "EXAM" } }, enrolment: { academicYear: exam.academicYear }, status: { in: ["SUBMITTED", "LOCKED"] } } });
  const people = await db.user.findMany({ where: { id: { in: runs.flatMap((r) => [r.processedById, r.approvedById ?? "", r.publishedById ?? ""]) } } });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";

  const checks = [
    { ok: eligCount > 0, label: "Attendance eligibility determined", detail: `${eligCount} course registrations evaluated` },
    { ok: exam.admitCardsPublished, label: "Examination conducted with published admit cards", detail: exam.admitCardsPublished ? "Admit cards issued" : "Not yet" },
    { ok: internals > 0, label: "Internal assessment marks submitted by faculty", detail: `${internals} component marks received` },
    { ok: scripts > 0 && finalised === scripts, label: "All answer scripts evaluated and finalised", detail: `${finalised}/${scripts} finalised · ${pendingEvals} evaluation(s) pending${thirdEvals ? ` · ${thirdEvals} awaiting third evaluation` : ""}`, warn: scripts > 0 && finalised < scripts },
  ];
  const canProcess = ["ADMIN", "COE", "EXAM_STAFF"].includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Result Processing"
        title={exam.name}
        description="Results are computed by the rule engine from internal assessment and evaluated marks, then verified by a second officer and released by the Vice-Chancellor."
        actions={canProcess && <ProcessButton examId={exam.id} disabled={scripts === 0} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Readiness checklist" description="Results can be processed with pending items; affected courses are marked W (withheld)." />
          <ul className="divide-y divide-border">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-5 py-3 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : <CircleAlert className={`mt-0.5 h-4 w-4 ${c.warn ? "text-amber-600" : "text-muted-foreground"}`} />}
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.detail}
                    {c.warn && <> — <Link href={`/exams/${exam.id}?tab=scripts`} className="text-brand-700 hover:underline">view scripts</Link></>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Rules that will be applied" description="Recorded against every result run" />
          <CardBody className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Grading</span><Link href={`/rules/${grading?.key}`} className="text-brand-700 hover:underline">{grading?.name} · v{grading?.version}</Link></div>
            <div className="flex items-center justify-between"><span>Grace marks</span><Link href={`/rules/${grace?.key}`} className="text-brand-700 hover:underline">{grace?.name} · v{grace?.version}</Link></div>
            <div className="flex items-center justify-between"><span>Pass rules</span><Link href="/academics/schemes" className="text-brand-700 hover:underline">Evaluation schemes (component minimums)</Link></div>
            <div className="flex items-center justify-between"><span>Workflow</span><span className="text-muted-foreground">Exam Branch → COE (verify) → VC (release)</span></div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Result runs" description="Every run is retained; re-processing supersedes earlier unpublished runs." />
        <Table>
          <THead>
            <tr>
              <TH>Run</TH>
              <TH>Status</TH>
              <TH>Processed</TH>
              <TH>Approved</TH>
              <TH>Published</TH>
              <TH className="text-right">Pass / backlog / withheld</TH>
            </tr>
          </THead>
          <tbody>
            {runs.map((r) => {
              const s = r.summary as { pass: number; fail: number; withheld: number } | null;
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/results/${r.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(r.processedAt, true)}</Link>
                  </TD>
                  <TD><Badge tone={RUN_TONE[r.status as keyof typeof RUN_TONE] ?? "neutral"}>{r.status}</Badge></TD>
                  <TD className="text-xs">{name(r.processedById)}</TD>
                  <TD className="text-xs">{r.approvedById ? `${name(r.approvedById)} · ${formatDate(r.approvedAt!, true)}` : "—"}</TD>
                  <TD className="text-xs">{r.publishedById ? `${name(r.publishedById)} · ${formatDate(r.publishedAt!, true)}` : "—"}</TD>
                  <TD className="text-right">{s ? `${s.pass} / ${s.fail} / ${s.withheld}` : "—"}</TD>
                </TR>
              );
            })}
            {runs.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">No results processed yet.</TD></TR>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
