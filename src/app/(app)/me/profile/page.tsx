import { IdCard } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { PROFILE_FIELDS, displayValue } from "@/lib/students/profile";
import { CATEGORY_LABELS } from "@/lib/admissions/shared";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ChangeRequestForm } from "./client";

export default async function MyProfilePage() {
  const user = await requirePage("/me/profile");
  if (!user.studentId) return <EmptyState title="No student record linked" />;
  const student = await db.student.findUniqueOrThrow({ where: { id: user.studentId }, include: { batch: { include: { programme: true } }, profileRequests: { orderBy: { createdAt: "desc" } }, application: true } });
  const record = student as unknown as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student portal"
        title="Profile & ID card"
        description={`${student.name} · ${student.rollNo} · University ID ${student.uid}`}
        actions={
          <a href="/api/id-card" target="_blank" className={buttonVariants({ variant: "accent" })}>
            <IdCard className="h-4 w-4" /> Download ID card
          </a>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Your record" description={`${student.batch.name} · ${student.batch.programme.name}`} />
          <dl className="divide-y divide-border text-sm">
            {[
              ["University ID", student.uid],
              ["Roll No.", student.rollNo],
              ["Institutional e-mail", student.email],
              ["ABC ID", student.abcId ?? "—"],
              ...Object.entries(PROFILE_FIELDS).map(([k, f]) => [f.label, displayValue(k, record[k] instanceof Date ? (record[k] as Date).toISOString() : (record[k] as string | null))]),
              ...(student.application ? [["Admitted through", `${student.application.appNo} · merit rank ${student.application.meritRank}`]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Update your details" />
            <CardBody>
              <ChangeRequestForm fields={Object.entries(PROFILE_FIELDS).map(([key, f]) => ({ key, ...f }))} categories={Object.entries(CATEGORY_LABELS)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Correction requests" />
            {student.profileRequests.length === 0 ? (
              <CardBody className="text-sm text-muted-foreground">No requests yet.</CardBody>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Field</TH>
                    <TH>Change</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {student.profileRequests.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-sm">{PROFILE_FIELDS[r.field]?.label ?? r.field}<div className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</div></TD>
                      <TD className="text-sm">{displayValue(r.field, r.oldValue)} → <strong>{displayValue(r.field, r.newValue)}</strong></TD>
                      <TD>
                        <Badge tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}>{r.status === "PENDING" ? "With the Academic Section" : r.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                        {r.remark && <div className="mt-1 text-xs text-muted-foreground">{r.remark}</div>}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
