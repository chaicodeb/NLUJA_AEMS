import { CheckCircle2, Download, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { getStudentExamView } from "@/lib/exams/registration";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { RegistrationForm } from "./registration-form";
import { currentSupplementary, supplementaryOptions } from "@/lib/results/supplementary";
import { SupplementaryRegistration } from "../../supplementary/client";

export default async function MyExamsPage() {
  const user = await requirePage("/me/exams");
  if (!user.studentId) return <EmptyState title="No student record linked" />;
  const exam = await db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" }, type: "REGULAR" }, orderBy: { startDate: "desc" } });
  if (!exam) return <EmptyState title="No examinations scheduled" />;
  const view = await getStudentExamView(user.studentId, exam.id);
  const sup = await currentSupplementary();
  const supView = sup ? await supplementaryOptions(user.studentId, sup.id) : null;
  const supEligible = supView?.options.filter((o) => o.kind) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student portal"
        title="Examination registration"
        description={`${exam.name} · ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`}
        actions={
          view.admitCard && exam.admitCardsPublished && view.registration ? (
            <a href={`/api/admit-card/${view.registration.id}`} target="_blank" className={buttonVariants({ variant: "success" })}>
              <Download className="h-4 w-4" /> Download admit card
            </a>
          ) : null
        }
      />
      {sup && supView && (supView.registration || (sup.registrationOpen && supEligible.length > 0)) && (
        <Card>
          <CardHeader
            title={sup.name}
            description={`${formatDate(sup.startDate)} – ${formatDate(sup.endDate)} · ₹${supView.params.feePerPaper} per paper · internal assessment carried forward`}
            action={<Badge tone={supView.registration ? "green" : "amber"}>{supView.registration ? "Registered" : "Registration open"}</Badge>}
          />
          <div className="px-5 py-4">
            {supView.registration ? (
              <div className="space-y-2 text-sm">
                <p>Fee received · <span className="font-mono">{supView.registration.paymentRef}</span> · {formatDate(supView.registration.submittedAt, true)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {supView.registration.papers.map((rp) => (
                    <Badge key={rp.id} tone={rp.kind === "BACKLOG" ? "amber" : "blue"}>{rp.examPaper.course.code} · {rp.kind === "BACKLOG" ? "backlog" : "improvement"} · {formatDate(rp.examPaper.date)}</Badge>
                  ))}
                </div>
              </div>
            ) : (
              <SupplementaryRegistration examId={sup.id} options={supView.options} fee={supView.params.feePerPaper} maxImprovement={supView.params.maxImprovementPapers} />
            )}
          </div>
        </Card>
      )}

      {view.registration ? (
        <>
          <Callout tone="green" title="Registration submitted">
            Fee of ₹{exam.feeAmount} received · Payment reference <span className="font-mono">{view.registration.paymentRef}</span> · {formatDate(view.registration.submittedAt, true)}
            {!exam.admitCardsPublished && <> — your admit card will be available here once the Controller of Examinations publishes the seating plan.</>}
          </Callout>
          <Card>
            <CardHeader title="Your papers" description={exam.admitCardsPublished ? "Centre, room and bench as printed on your admit card" : "Seat allocation pending"} />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Paper</TH>
                  <TH>Status</TH>
                  <TH>Room</TH>
                  <TH>Bench</TH>
                </tr>
              </THead>
              <tbody>
                {view.papers.map((p) => (
                  <TR key={p.paperId}>
                    <TD className="whitespace-nowrap">{formatDate(p.date, true)}</TD>
                    <TD><span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.title}</TD>
                    <TD>
                      {p.registered ? <Badge tone="green">Registered</Badge> : <Badge tone="red">Not permitted</Badge>}
                      {!p.registered && <div className="mt-1 max-w-xs text-xs text-red-700">{p.reason}</div>}
                    </TD>
                    <TD>{exam.admitCardsPublished && p.seat ? p.seat.room : "—"}</TD>
                    <TD className="font-mono font-semibold">{exam.admitCardsPublished && p.seat ? p.seat.bench.split("/")[1] : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      ) : !exam.registrationOpen ? (
        <Callout tone="amber" title="Registration closed">The registration window for this examination has closed. Contact the Examination Branch.</Callout>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Callout tone="blue" title="How eligibility is decided">
              Each paper is checked against the University&apos;s attendance rule for your programme. Papers you are not eligible for cannot be selected — the reason is shown against each.
            </Callout>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> {view.papers.filter((p) => p.eligible).length} eligible</span>
              <span className="inline-flex items-center gap-1.5"><XCircle className="h-4 w-4 text-red-600" /> {view.papers.filter((p) => !p.eligible).length} not eligible</span>
            </div>
          </div>
          <RegistrationForm
            examId={exam.id}
            fee={exam.feeAmount}
            papers={view.papers.map((p) => ({ ...p, date: p.date.toISOString() }))}
          />
        </>
      )}
    </div>
  );
}
