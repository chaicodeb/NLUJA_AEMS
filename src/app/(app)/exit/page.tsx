import { Download } from "lucide-react";
import { requirePage } from "@/lib/session";
import { EXIT_TYPES, exitRegister } from "@/lib/exit/exit";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { IssueCertificatesButton, RefundButton } from "./client";

export default async function ExitRegisterPage() {
  const user = await requirePage("/exit");
  const rows = await exitRegister();
  const open = rows.filter((r) => r.status === "OPEN");
  const refundsDue = rows.filter((r) => r.allCleared && r.bankAccount && !r.refundedAt);
  const refunded = rows.filter((r) => r.refundedAt).reduce((a, r) => a + r.net, 0);
  const canRefund = ["ACCOUNTS", "ADMIN"].includes(user.role);
  const canIssue = ["REGISTRAR", "ADMIN"].includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student services"
        title="Exit & certificates"
        description="Every student leaving the University — on graduation, withdrawal or transfer — is tracked from no-dues to caution-deposit refund and the migration and character certificates."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Exits in progress" value={open.length} tone={open.length ? "amber" : "neutral"} />
        <Stat label="Completed" value={rows.length - open.length} tone="green" />
        <Stat label="Refunds to release" value={refundsDue.length} hint="Cleared, bank details received" tone={refundsDue.length ? "amber" : "neutral"} />
        <Stat label="Deposits refunded" value={`₹${refunded.toLocaleString("en-IN")}`} tone="brand" />
      </div>
      <Card>
        <CardHeader title="Exit register" description="Open requests first" />
        {rows.length === 0 ? (
          <EmptyState title="No exit requests" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Type</TH>
                <TH>No-dues</TH>
                <TH>Exit survey</TH>
                <TH>Caution deposit</TH>
                <TH>Certificates</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-medium">{r.student.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.student.rollNo} · {r.student.batch.code}</div>
                  </TD>
                  <TD className="text-sm">
                    {EXIT_TYPES[r.type]}
                    <div className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</div>
                  </TD>
                  <TD>
                    <Badge tone={r.allCleared ? "green" : "amber"}>{r.cleared}/4 cleared</Badge>
                    {r.blockers.length > 0 && <div className="mt-1 max-w-48 text-xs text-muted-foreground">Waiting: {r.blockers.join(", ")}</div>}
                  </TD>
                  <TD>{r.type === "GRADUATION" ? <Badge tone={r.surveyDone ? "green" : "amber"}>{r.surveyDone ? "Submitted" : "Pending"}</Badge> : <span className="text-xs text-muted-foreground">n/a</span>}</TD>
                  <TD className="text-sm">
                    {r.refundedAt ? (
                      <>
                        <Badge tone="green">₹{r.net.toLocaleString("en-IN")} refunded</Badge>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{r.refundRef}</div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          ₹{r.cautionDeposit.toLocaleString("en-IN")}{r.deductions ? ` − ₹${r.deductions.toLocaleString("en-IN")} recovered` : ""} = <strong className="text-foreground">₹{r.net.toLocaleString("en-IN")}</strong>
                        </div>
                        {!r.bankAccount ? (
                          <div className="text-xs text-amber-700">Bank details awaited</div>
                        ) : canRefund && r.allCleared ? (
                          <RefundButton studentId={r.studentId} net={r.net} />
                        ) : (
                          <div className="text-xs text-muted-foreground">A/c ••••{r.bankAccount.slice(-4)} · {r.ifsc}</div>
                        )}
                      </div>
                    )}
                  </TD>
                  <TD>
                    {r.certificates.length ? (
                      <div className="flex flex-col gap-1">
                        {r.certificates.map((d) => (
                          <a key={d.id} href={`/api/certificate/${d.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                            <Download className="h-3 w-3" /> {d.type === "MIGRATION" ? "Migration" : "Character"} · {d.verifyCode}
                          </a>
                        ))}
                      </div>
                    ) : canIssue && r.allCleared && r.surveyDone ? (
                      <IssueCertificatesButton studentId={r.studentId} name={r.student.name} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{!r.allCleared ? "After no-dues" : "After exit survey"}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
