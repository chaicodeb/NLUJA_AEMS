import { CheckCircle2, Download, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { currentConvocation, degreeStatus } from "@/lib/convocation/degree";
import { getT } from "@/lib/i18n/server";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DegreeApplicationForm, ProvisionalButton } from "../../convocation/client";

export default async function MyDegreePage() {
  const user = await requirePage("/me/degree");
  const t = await getT();
  const studentId = user.studentId ?? user.wardId;
  if (!studentId) return <EmptyState title={t("No student record linked")} />;
  const [status, conv] = await Promise.all([degreeStatus(studentId), currentConvocation()]);
  const { student } = status;
  const finalYear = student.batch.currentSemester >= student.batch.programme.durationSemesters;
  if (!finalYear) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t("Student portal")} title={t("Degree & convocation")} description={`${student.name} · ${student.batch.name}`} />
        <Callout tone="blue" title={t("Not yet in the final semester")}>
          {t("You are in semester {n} of {total}. Degree eligibility, the provisional certificate and convocation registration open here once your final-semester results are published.", { n: student.batch.currentSemester, total: student.batch.programme.durationSemesters })}
        </Callout>
      </div>
    );
  }
  const application = conv ? await db.degreeApplication.findUnique({ where: { convocationId_studentId: { convocationId: conv.id, studentId } } }) : null;
  const [degree, provisional] = await Promise.all([
    application ? db.document.findFirst({ where: { type: "DEGREE", refId: application.id, revoked: false } }) : null,
    db.document.findFirst({ where: { type: "PROVISIONAL", studentId, revoked: false } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.role === "PARENT" ? t("Parent portal · read-only") : t("Student portal")}
        title={t("Degree & convocation")}
        description={`${student.name} · ${student.rollNo} · ${student.batch.programme.degreeTitle ?? student.batch.programme.name}`}
        actions={
          degree ? (
            <a href={`/api/degree/${degree.id}`} target="_blank" className={buttonVariants({ variant: "success" })}>
              <Download className="h-4 w-4" /> {t("Degree certificate")}
            </a>
          ) : provisional ? (
            <a href={`/api/degree/${provisional.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> {t("Provisional certificate")}
            </a>
          ) : status.eligible && user.role === "STUDENT" ? (
            <ProvisionalButton />
          ) : null
        }
      />

      <Card>
        <CardHeader
          title={t("Degree requirements")}
          description={`${t("CGPA {cgpa} · {earned}/{required} credits", { cgpa: status.cgpa.toFixed(2), earned: status.earned, required: status.required })}${status.division ? ` · ${t.loose(status.division)}` : ""}`}
          action={<Badge tone={status.eligible ? "green" : "red"}>{status.eligible ? t("Eligible for the degree") : t("Not yet eligible")}</Badge>}
        />
        <ul className="divide-y divide-border">
          {status.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 px-5 py-3 text-sm">
              {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-600" />}
              <div>
                <div className="font-medium">{c.labelMsg ? t(...c.labelMsg) : c.label}</div>
                <div className="text-xs text-muted-foreground">{c.detailMsg ? t(...c.detailMsg) : c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {conv && (
        <Card>
          <CardHeader title={conv.title} description={`${formatDate(conv.date)} · ${conv.venue}`} />
          <div className="px-5 py-4 text-sm">
            {degree ? (
              <Callout tone="green" title={t("Degree conferred")}>
                {t("Your degree certificate ({code}) is digitally signed and available above; it will also appear in your DigiLocker account.", { code: degree.verifyCode })}
              </Callout>
            ) : application ? (
              <div className="space-y-2">
                <Badge tone={application.status === "APPROVED" ? "green" : application.status === "NOT_ELIGIBLE" ? "red" : "amber"}>
                  {application.status === "APPROVED" ? t("Approved — serial {n}", { n: application.serialNo ?? "—" }) : application.status === "NOT_ELIGIBLE" ? t("Not eligible") : t("Application received")}
                </Badge>
                <p className="text-muted-foreground">
                  {application.mode === "IN_PERSON" ? t("Receiving in person with {n} guest pass(es)", { n: application.guests }) : t("In absentia")} · {t("fee ₹{fee} ({ref}) · applied {date}", { fee: application.fee, ref: application.paymentRef ?? "—", date: formatDate(application.appliedAt) })}
                </p>
                {application.reason && <p className="text-xs text-red-700">{application.reason}</p>}
              </div>
            ) : conv.status === "APPLICATIONS_OPEN" && user.role === "STUDENT" ? (
              status.academicOk ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">{t("Apply by {date}.", { date: formatDate(conv.applicationDeadline) })} {status.eligible ? "" : t("Clear the pending no-dues before the list is frozen, or your degree will be held back.")}</p>
                  <DegreeApplicationForm feeInPerson={conv.feeInPerson} feeInAbsentia={conv.feeInAbsentia} />
                </div>
              ) : (
                <Callout tone="amber">{t("Clear your backlog first — you can apply for the next convocation once all papers are passed.")}</Callout>
              )
            ) : (
              <p className="text-muted-foreground">{t("Convocation applications are closed.")}</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
