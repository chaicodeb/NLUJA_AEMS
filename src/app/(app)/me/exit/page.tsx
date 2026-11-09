import Link from "next/link";
import { CheckCircle2, Circle, Download, XCircle } from "lucide-react";
import { requirePage } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/convocation/degree";
import { EXIT_TYPES, exitStatus } from "@/lib/exit/exit";
import { EXAMS, SECTORS } from "@/lib/alumni/alumni";
import { getT } from "@/lib/i18n/server";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AlumniProfileForm, BankDetailsForm, StartExitForm } from "../../exit/client";

export default async function MyExitPage() {
  const user = await requirePage("/me/exit");
  const t = await getT();
  if (!user.studentId) return <EmptyState title={t("No student record linked")} />;
  const s = await exitStatus(user.studentId);
  const { student, request: req, refund } = s;
  const profile = student.alumniProfile;
  const inr = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Student portal")} title={t("Exit & alumni")} description={`${student.name} · ${student.rollNo} · ${student.batch.name}`} />

      {!req ? (
        <Card>
          <CardHeader
            title={s.graduating ? t("Leaving the University") : t("Withdrawal or transfer")}
            description={
              s.graduating
                ? t("Start your exit formalities once your final-semester results are out: no-dues from four departments, the graduate exit survey, and your caution-deposit refund.")
                : t("If you need to leave before completing the programme, apply here. Your migration and character certificates are issued after no-dues clearance.")
            }
          />
          <CardBody>
            <StartExitForm graduating={s.graduating} />
          </CardBody>
        </Card>
      ) : (
        <>
          {req.status === "COMPLETED" && (
            <Callout tone="green" title={t("Exit formalities complete")}>
              {t("Your certificates are digitally signed and available below.")} {req.type === "GRADUATION" ? t("Welcome to the NLUJA alumni network.") : t("We wish you well.")}
            </Callout>
          )}
          <Card>
            <CardHeader
              title={t("{type} — exit checklist", { type: t.loose(EXIT_TYPES[req.type]) })}
              description={t("Started {date}", { date: formatDate(req.createdAt) })}
              action={<Badge tone={req.status === "COMPLETED" ? "green" : "amber"}>{req.status === "COMPLETED" ? t("Completed") : t("In progress")}</Badge>}
            />
            <ul className="divide-y divide-border text-sm">
              {s.clearances.map((c) => (
                <li key={c.department} className="flex items-start gap-3 px-5 py-3">
                  {c.row?.status === "CLEARED" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : c.row?.status === "DUES" ? <XCircle className="mt-0.5 h-4 w-4 text-red-600" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1">
                    <div className="font-medium">{t("{dept} no-dues", { dept: t.loose(DEPARTMENTS[c.department]) })}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.row?.status === "DUES"
                        ? t("₹{amount} due — {note}. Pay at the counter or ask for it to be recovered from your caution deposit.", { amount: c.row.amount ?? 0, note: c.row.note ?? "" })
                        : c.row?.status === "CLEARED" ? (c.row.note ?? t("Cleared")) : t("Awaiting the department")}
                    </div>
                  </div>
                </li>
              ))}
              {req.type === "GRADUATION" && (
                <li className="flex items-start gap-3 px-5 py-3">
                  {s.surveyDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-leaf-600" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1">
                    <div className="font-medium">{t("Graduate exit survey")}</div>
                    <div className="text-xs text-muted-foreground">{s.surveyDone ? t("Submitted anonymously — thank you.") : t("Anonymous, about three minutes. Required before certificates are issued.")}</div>
                  </div>
                  {!s.surveyDone && s.exitFormId && <Link href={`/me/feedback/${s.exitFormId}`} className={buttonVariants({ size: "sm" })}>{t("Take the survey")}</Link>}
                </li>
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title={t("Caution deposit refund")}
              description={
                refund!.deductions
                  ? t("Deposit ₹{deposit} − ₹{deductions} recovered = ₹{net} refundable", { deposit: inr(refund!.deposit), deductions: inr(refund!.deductions), net: inr(refund!.net) })
                  : t("Deposit ₹{deposit} = ₹{net} refundable", { deposit: inr(refund!.deposit), net: inr(refund!.net) })
              }
              action={refund!.paid ? <Badge tone="green">{t("Refunded")}</Badge> : undefined}
            />
            <CardBody className="text-sm">
              {refund!.paid ? (
                <p>{t("₹{net} paid on {date} by NEFT {ref} to A/c ••••{last4}.", { net: inr(refund!.net), date: formatDate(req.refundedAt!), ref: req.refundRef ?? "", last4: req.bankAccount?.slice(-4) ?? "" })}</p>
              ) : req.bankAccount ? (
                <p className="text-muted-foreground">{t("Refund account A/c ••••{last4} ({ifsc}). Accounts will release the refund once every department has cleared you.", { last4: req.bankAccount.slice(-4), ifsc: req.ifsc ?? "" })}</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-muted-foreground">{t("Enter the account in your own name for the refund.")}</p>
                  <BankDetailsForm />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("Certificates")} description={t("Migration and character certificates, signed by the Registrar and verifiable by QR code")} />
            <CardBody>
              {s.certificates.length ? (
                <div className="flex flex-wrap gap-2">
                  {s.certificates.map((d) => (
                    <a key={d.id} href={`/api/certificate/${d.id}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Download className="h-3.5 w-3.5" /> {d.type === "MIGRATION" ? t("Migration certificate") : t("Character certificate")}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {req.type === "GRADUATION" ? t("Issued by the Registrar after all four departments clear you and the exit survey is submitted.") : t("Issued by the Registrar after all four departments clear you.")}
                </p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {s.graduating && (
        <Card>
          <CardHeader
            title={t("Alumni profile")}
            description={t("Stay connected. Your progression (employment, higher studies, examinations qualified) also feeds the University's NAAC and NIRF returns.")}
            action={profile ? <Badge tone="green">{t("Updated {date}", { date: formatDate(profile.updatedAt) })}</Badge> : undefined}
          />
          <CardBody>
            <AlumniProfileForm
              sectors={Object.entries(SECTORS).map(([k, v]) => [k, t.loose(v.label)])}
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
