import { CheckCircle2, Download, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { currentConvocation, degreeStatus } from "@/lib/convocation/degree";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DegreeApplicationForm, ProvisionalButton } from "../../convocation/client";

export default async function MyDegreePage() {
  const user = await requirePage("/me/degree");
  const studentId = user.studentId ?? user.wardId;
  if (!studentId) return <EmptyState title="No student record linked" />;
  const [status, conv] = await Promise.all([degreeStatus(studentId), currentConvocation()]);
  const { student } = status;
  const finalYear = student.batch.currentSemester >= student.batch.programme.durationSemesters;
  if (!finalYear) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Student portal" title="Degree & convocation" description={`${student.name} · ${student.batch.name}`} />
        <Callout tone="blue" title="Not yet in the final semester">
          You are in semester {student.batch.currentSemester} of {student.batch.programme.durationSemesters}. Degree eligibility, the provisional certificate and convocation registration open here once your final-semester results are published.
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
        eyebrow={user.role === "PARENT" ? "Parent portal · read-only" : "Student portal"}
        title="Degree & convocation"
        description={`${student.name} · ${student.rollNo} · ${student.batch.programme.degreeTitle ?? student.batch.programme.name}`}
        actions={
          degree ? (
            <a href={`/api/degree/${degree.id}`} target="_blank" className={buttonVariants({ variant: "success" })}>
              <Download className="h-4 w-4" /> Degree certificate
            </a>
          ) : provisional ? (
            <a href={`/api/degree/${provisional.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> Provisional certificate
            </a>
          ) : status.eligible && user.role === "STUDENT" ? (
            <ProvisionalButton />
          ) : null
        }
      />

      <Card>
        <CardHeader title="Degree requirements" description={`CGPA ${status.cgpa.toFixed(2)}${status.division ? ` · ${status.division}` : ""} · ${status.earned}/${status.required} credits`} action={<Badge tone={status.eligible ? "green" : "red"}>{status.eligible ? "Eligible for the degree" : "Not yet eligible"}</Badge>} />
        <ul className="divide-y divide-border">
          {status.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 px-5 py-3 text-sm">
              {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-600" />}
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
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
              <Callout tone="green" title="Degree conferred">
                Your degree certificate ({degree.verifyCode}) is digitally signed and available above; it will also appear in your DigiLocker account.
              </Callout>
            ) : application ? (
              <div className="space-y-2">
                <Badge tone={application.status === "APPROVED" ? "green" : application.status === "NOT_ELIGIBLE" ? "red" : "amber"}>
                  {application.status === "APPROVED" ? `Approved — serial ${application.serialNo}` : application.status === "NOT_ELIGIBLE" ? "Not eligible" : "Application received"}
                </Badge>
                <p className="text-muted-foreground">
                  {application.mode === "IN_PERSON" ? `Receiving in person with ${application.guests} guest pass(es)` : "In absentia"} · fee ₹{application.fee} ({application.paymentRef}) · applied {formatDate(application.appliedAt)}
                </p>
                {application.reason && <p className="text-xs text-red-700">{application.reason}</p>}
              </div>
            ) : conv.status === "APPLICATIONS_OPEN" && user.role === "STUDENT" ? (
              status.academicOk ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">Apply by {formatDate(conv.applicationDeadline)}. {status.eligible ? "" : "Clear the pending no-dues before the list is frozen, or your degree will be held back."}</p>
                  <DegreeApplicationForm feeInPerson={conv.feeInPerson} feeInAbsentia={conv.feeInAbsentia} />
                </div>
              ) : (
                <Callout tone="amber">Clear your backlog first — you can apply for the next convocation once all papers are passed.</Callout>
              )
            ) : (
              <p className="text-muted-foreground">Convocation applications are closed.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
