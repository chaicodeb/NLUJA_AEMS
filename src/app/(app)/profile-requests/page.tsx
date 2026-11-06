import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { PROFILE_FIELDS, displayValue } from "@/lib/students/profile";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DecideRequest } from "../me/profile/client";

export default async function ProfileRequestsPage() {
  await requirePage("/profile-requests");
  const rows = await db.profileChangeRequest.findMany({ include: { student: { include: { batch: true } } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 100 });
  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student services"
        title="Profile corrections"
        description="Students update their contact details themselves. Changes to name, date of birth, parent's name or category appear on certificates, so they come here for approval against the supporting document."
      />
      <Card>
        <CardHeader title="Awaiting approval" description={`${pending.length} request${pending.length === 1 ? "" : "s"}`} />
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Field</TH>
                <TH>Change</TH>
                <TH>Reason given</TH>
                <TH className="text-right">Decision</TH>
              </tr>
            </THead>
            <tbody>
              {pending.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-medium">{r.student.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.student.rollNo} · {r.student.batch.code}</div>
                  </TD>
                  <TD className="text-sm">{PROFILE_FIELDS[r.field]?.label}<div className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</div></TD>
                  <TD className="text-sm">{displayValue(r.field, r.oldValue)} → <strong>{displayValue(r.field, r.newValue)}</strong></TD>
                  <TD className="max-w-xs text-xs text-muted-foreground">{r.reason}</TD>
                  <TD className="text-right"><DecideRequest id={r.id} name={r.student.name} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {decided.length > 0 && (
        <Card>
          <CardHeader title="Recently decided" />
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Change</TH>
                <TH>Decision</TH>
              </tr>
            </THead>
            <tbody>
              {decided.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.student.name}</TD>
                  <TD className="text-sm">{PROFILE_FIELDS[r.field]?.label}: {displayValue(r.field, r.oldValue)} → {displayValue(r.field, r.newValue)}</TD>
                  <TD>
                    <Badge tone={r.status === "APPROVED" ? "green" : "red"}>{r.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">{r.decidedAt ? formatDate(r.decidedAt) : ""}{r.remark ? ` · ${r.remark}` : ""}</span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
