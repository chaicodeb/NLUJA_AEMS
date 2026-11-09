import { CheckCircle2, Download, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { getStudentExamView } from "@/lib/exams/registration";
import { getT } from "@/lib/i18n/server";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { RegistrationForm } from "./registration-form";
import { currentSupplementary, supplementaryOptions } from "@/lib/results/supplementary";
import { SupplementaryRegistration } from "../../supplementary/client";

export default async function MyExamsPage() {
  const user = await requirePage("/me/exams");
  const t = await getT();
  if (!user.studentId) return <EmptyState title={t("No student record linked")} />;
  const exam = await db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" }, type: "REGULAR", status: { not: "PLANNED" } }, orderBy: { startDate: "desc" } });
  if (!exam) return <EmptyState title={t("No examinations scheduled")} />;
  const view = await getStudentExamView(user.studentId, exam.id);
  const sup = await currentSupplementary();
  const supView = sup ? await supplementaryOptions(user.studentId, sup.id) : null;
  const supEligible = supView?.options.filter((o) => o.kind) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Student portal")}
        title={t("Examination registration")}
        description={`${exam.name} · ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`}
        actions={
          view.admitCard && exam.admitCardsPublished && view.registration ? (
            <a href={`/api/admit-card/${view.registration.id}`} target="_blank" className={buttonVariants({ variant: "success" })}>
              <Download className="h-4 w-4" /> {t("Download admit card")}
            </a>
          ) : null
        }
      />
      {sup && supView && (supView.registration || (sup.registrationOpen && supEligible.length > 0)) && (
        <Card>
          <CardHeader
            title={sup.name}
            description={`${formatDate(sup.startDate)} – ${formatDate(sup.endDate)} · ${t("₹{fee} per paper · internal assessment carried forward", { fee: supView.params.feePerPaper })}`}
            action={<Badge tone={supView.registration ? "green" : "amber"}>{supView.registration ? t("Registered") : t("Registration open")}</Badge>}
          />
          <div className="px-5 py-4">
            {supView.registration ? (
              <div className="space-y-2 text-sm">
                <p>{t("Fee received · {ref} · {when}", { ref: supView.registration.paymentRef ?? "—", when: formatDate(supView.registration.submittedAt, true) })}</p>
                <div className="flex flex-wrap gap-1.5">
                  {supView.registration.papers.map((rp) => (
                    <Badge key={rp.id} tone={rp.kind === "BACKLOG" ? "amber" : "blue"}>{rp.examPaper.course.code} · {rp.kind === "BACKLOG" ? t("backlog") : t("improvement")} · {formatDate(rp.examPaper.date)}</Badge>
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
          <Callout tone="green" title={t("Registration submitted")}>
            {t("Fee of ₹{fee} received · Payment reference {ref} · {when}", { fee: exam.feeAmount, ref: view.registration.paymentRef ?? "—", when: formatDate(view.registration.submittedAt, true) })}
            {!exam.admitCardsPublished && <> — {t("Your admit card will be available here once the Controller of Examinations publishes the seating plan.")}</>}
          </Callout>
          <Card>
            <CardHeader title={t("Your papers")} description={exam.admitCardsPublished ? t("Centre, room and bench as printed on your admit card") : t("Seat allocation pending")} />
            <Table>
              <THead>
                <tr>
                  <TH>{t("Date")}</TH>
                  <TH>{t("Paper")}</TH>
                  <TH>{t("Status")}</TH>
                  <TH>{t("Room")}</TH>
                  <TH>{t("Bench")}</TH>
                </tr>
              </THead>
              <tbody>
                {view.papers.map((p) => (
                  <TR key={p.paperId}>
                    <TD className="whitespace-nowrap">{formatDate(p.date, true)}</TD>
                    <TD><span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.title}</TD>
                    <TD>
                      {p.registered ? <Badge tone="green">{t("Registered")}</Badge> : <Badge tone="red">{t("Not permitted")}</Badge>}
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
        <Callout tone="amber" title={t("Registration closed")}>{t("The registration window for this examination has closed. Contact the Examination Branch.")}</Callout>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Callout tone="blue" title={t("How eligibility is decided")}>
              {t("Each paper is checked against the University's attendance rule for your programme. Papers you are not eligible for cannot be selected — the reason is shown against each.")}
            </Callout>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> {t("{n} eligible", { n: view.papers.filter((p) => p.eligible).length })}</span>
              <span className="inline-flex items-center gap-1.5"><XCircle className="h-4 w-4 text-red-600" /> {t("{n} not eligible", { n: view.papers.filter((p) => !p.eligible).length })}</span>
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
