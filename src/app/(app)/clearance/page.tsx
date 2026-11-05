import { requirePage } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/convocation/degree";
import { EXIT_TYPES, deskQueue, departmentsFor } from "@/lib/exit/exit";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ClearanceActions } from "../exit/client";

const ORDER: Record<string, number> = { PENDING: 0, DUES: 1, CLEARED: 2 };

export default async function ClearanceDeskPage() {
  const user = await requirePage("/clearance");
  const departments = departmentsFor(user.role);
  const rows = (await deskQueue(departments)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.student.name.localeCompare(b.student.name));
  const pending = rows.filter((r) => r.status === "PENDING");
  const dues = rows.filter((r) => r.status === "DUES");
  const single = departments.length === 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student services"
        title={single ? `No-dues desk — ${DEPARTMENTS[departments[0]]}` : "No-dues desk"}
        description="Clear students leaving the University, or record what they owe. Dues can be recovered from the ₹10,000 caution deposit at exit; the balance is refunded by Accounts."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting your decision" value={pending.length} tone={pending.length ? "amber" : "green"} />
        <Stat label="Dues outstanding" value={dues.length} hint={dues.length ? `₹${dues.reduce((a, r) => a + (r.amount ?? 0), 0).toLocaleString("en-IN")} to be paid` : undefined} tone={dues.length ? "red" : "neutral"} />
        <Stat label="Cleared" value={rows.length - pending.length - dues.length} tone="green" />
      </div>
      {single && pending.length > 0 && (
        <Callout tone="blue">
          Check your records (issue register, room inventory, fee ledger) for each student below. Choose <strong>No dues</strong> to clear, <strong>Dues</strong> to block clearance until paid, or <strong>From deposit</strong> to recover the amount from the caution deposit and clear in one step.
        </Callout>
      )}
      <Card>
        <CardHeader title="Clearance requests" description={`${rows.length} request${rows.length === 1 ? "" : "s"} · pending first`} />
        {rows.length === 0 ? (
          <EmptyState title="No clearance requests" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                {!single && <TH>Department</TH>}
                <TH>Purpose</TH>
                <TH>Status</TH>
                <TH>Details</TH>
                <TH className="text-right">Action</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const exit = r.student.exitRequest;
                return (
                  <TR key={r.id}>
                    <TD>
                      <div className="font-medium">{r.student.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.student.rollNo} · {r.student.batch.code}</div>
                    </TD>
                    {!single && <TD className="text-sm">{DEPARTMENTS[r.department]}</TD>}
                    <TD className="text-sm">
                      {exit ? EXIT_TYPES[exit.type] : "Degree"}
                      {exit && <div className="text-xs text-muted-foreground">since {formatDate(exit.createdAt)}</div>}
                    </TD>
                    <TD>
                      <Badge tone={r.status === "CLEARED" ? "green" : r.status === "DUES" ? "red" : "amber"}>{r.status === "DUES" ? `Dues ₹${r.amount}` : r.status === "CLEARED" ? "Cleared" : "Pending"}</Badge>
                    </TD>
                    <TD className="max-w-xs text-xs text-muted-foreground">{r.note ?? "—"}</TD>
                    <TD className="text-right">
                      {r.status !== "CLEARED" && departments.includes(r.department) && (
                        <ClearanceActions studentId={r.studentId} department={r.department} name={r.student.name} status={r.status} atExit={!!exit && exit.status === "OPEN"} />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
