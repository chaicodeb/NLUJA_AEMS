import Link from "next/link";
import { CheckCircle2, Circle, Download, XCircle } from "lucide-react";
import { requirePage } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/convocation/degree";
import { EXIT_TYPES, exitStatus } from "@/lib/exit/exit";
import { EXAMS, SECTORS } from "@/lib/alumni/alumni";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AlumniProfileForm, BankDetailsForm, StartExitForm } from "../../exit/client";

export default async function MyExitPage() {
  const user = await requirePage("/me/exit");
  if (!user.studentId) return <EmptyState title="No student record linked" />;
  const s = await exitStatus(user.studentId);
  const { student, request: req, refund } = s;
  const profile = student.alumniProfile;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Student portal" title="Exit & alumni" description={`${student.name} · ${student.rollNo} · ${student.batch.name}`} />

      {!req ? (
        <Card>
          <CardHeader
            title={s.graduating ? "Leaving the University" : "Withdrawal or transfer"}
            description={s.graduating ? "Start your exit formalities once your final-semester results are out: no-dues from four departments, the graduate exit survey, and your caution-deposit refund." : "If you need to leave before completing the programme, apply here. Your migration and character certificates are issued after no-dues clearance."}
          />
          <CardBody>
            <StartExitForm graduating={s.graduating} />
          </CardBody>
        </Card>
      ) : (
        <>
          {req.status === "COMPLETED" && (
            <Callout tone="green" title="Exit formalities complete">
              Your certificates are digitally signed and available below. {req.type === "GRADUATION" ? "Welcome to the NLUJA alumni network." : "We wish you well."}
            </Callout>
          )}
          <Card>
            <CardHeader title={`${EXIT_TYPES[req.type]} — exit checklist`} description={`Started ${formatDate(req.createdAt)}`} action={<Badge tone={req.status === "COMPLETED" ? "green" : "amber"}>{req.status === "COMPLETED" ? "Completed" : "In progress"}</Badge>} />
            <ul className="divide-y divide-border text-sm">
              {s.clearances.map((c) => (
                <li key={c.department} className="flex items-start gap-3 px-5 py-3">
                  {c.row?.status === "CLEARED" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : c.row?.status === "DUES" ? <XCircle className="mt-0.5 h-4 w-4 text-red-600" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1">
                    <div className="font-medium">{DEPARTMENTS[c.department]} no-dues</div>
                    <div className="text-xs text-muted-foreground">{c.row?.status === "DUES" ? `₹${c.row.amount} due — ${c.row.note}. Pay at the counter or ask for it to be recovered from your caution deposit.` : c.row?.status === "CLEARED" ? (c.row.note ?? "Cleared") : "Awaiting the department"}</div>
                  </div>
                </li>
              ))}
              {req.type === "GRADUATION" && (
                <li className="flex items-start gap-3 px-5 py-3">
                  {s.surveyDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1">
                    <div className="font-medium">Graduate exit survey</div>
                    <div className="text-xs text-muted-foreground">{s.surveyDone ? "Submitted anonymously — thank you." : "Anonymous, about three minutes. Required before certificates are issued."}</div>
                  </div>
                  {!s.surveyDone && s.exitFormId && <Link href={`/me/feedback/${s.exitFormId}`} className={buttonVariants({ size: "sm" })}>Take the survey</Link>}
                </li>
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Caution deposit refund" description={`Deposit ₹${refund!.deposit.toLocaleString("en-IN")}${refund!.deductions ? ` − ₹${refund!.deductions.toLocaleString("en-IN")} recovered` : ""} = ₹${refund!.net.toLocaleString("en-IN")} refundable`} action={refund!.paid ? <Badge tone="green">Refunded</Badge> : undefined} />
            <CardBody className="text-sm">
              {refund!.paid ? (
                <p>₹{refund!.net.toLocaleString("en-IN")} paid on {formatDate(req.refundedAt!)} by NEFT <span className="font-mono">{req.refundRef}</span> to A/c ••••{req.bankAccount?.slice(-4)}.</p>
              ) : req.bankAccount ? (
                <p className="text-muted-foreground">Refund account A/c ••••{req.bankAccount.slice(-4)} ({req.ifsc}). Accounts will release the refund once every department has cleared you.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-muted-foreground">Enter the account in your own name for the refund.</p>
                  <BankDetailsForm />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Certificates" description="Migration and character certificates, signed by the Registrar and verifiable by QR code" />
            <CardBody>
              {s.certificates.length ? (
                <div className="flex flex-wrap gap-2">
                  {s.certificates.map((d) => (
                    <a key={d.id} href={`/api/certificate/${d.id}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Download className="h-3.5 w-3.5" /> {d.type === "MIGRATION" ? "Migration certificate" : "Character certificate"}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Issued by the Registrar after all four departments clear you{req.type === "GRADUATION" ? " and the exit survey is submitted" : ""}.</p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {s.graduating && (
        <Card>
          <CardHeader
            title="Alumni profile"
            description="Stay connected. Your progression (employment, higher studies, examinations qualified) also feeds the University's NAAC and NIRF returns."
            action={profile ? <Badge tone="green">Updated {formatDate(profile.updatedAt)}</Badge> : undefined}
          />
          <CardBody>
            <AlumniProfileForm
              sectors={Object.entries(SECTORS).map(([k, v]) => [k, v.label])}
              exams={EXAMS}
              initial={{
                sector: profile?.sector ?? "", organisation: profile?.organisation ?? "", designation: profile?.designation ?? "", city: profile?.city ?? "",
                phone: profile?.phone ?? "", qualifiedExams: profile?.qualifiedExams ?? [], directoryConsent: profile?.directoryConsent ?? true, mentor: profile?.mentor ?? false,
              }}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
