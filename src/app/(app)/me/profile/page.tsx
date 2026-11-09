import { IdCard } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { PROFILE_FIELDS, displayValue } from "@/lib/students/profile";
import { CATEGORY_LABELS } from "@/lib/admissions/shared";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ChangeRequestForm } from "./client";

export default async function MyProfilePage() {
  const user = await requirePage("/me/profile");
  const t = await getT();
  if (!user.studentId) return <EmptyState title={t("No student record linked")} />;
  const student = await db.student.findUniqueOrThrow({ where: { id: user.studentId }, include: { batch: { include: { programme: true } }, profileRequests: { orderBy: { createdAt: "desc" } }, application: true } });
  const record = student as unknown as Record<string, unknown>;
  const show = (field: string, v: string | null) => (field === "category" ? t.loose(displayValue(field, v)) : displayValue(field, v));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Student portal")}
        title={t("Profile & ID card")}
        description={t("{name} · {roll} · University ID {uid}", { name: student.name, roll: student.rollNo, uid: student.uid })}
        actions={
          <a href="/api/id-card" target="_blank" className={buttonVariants({ variant: "accent" })}>
            <IdCard className="h-4 w-4" /> {t("Download ID card")}
          </a>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title={t("Your record")} description={`${student.batch.name} · ${student.batch.programme.name}`} />
          <dl className="divide-y divide-border text-sm">
            {[
              [t("University ID"), student.uid],
              [t("Roll No."), student.rollNo],
              [t("Institutional e-mail"), student.email],
              ["ABC ID", student.abcId ?? "—"],
              ...Object.entries(PROFILE_FIELDS).map(([k, f]) => [t.loose(f.label), show(k, record[k] instanceof Date ? (record[k] as Date).toISOString() : (record[k] as string | null))]),
              ...(student.application ? [[t("Admitted through"), t("{app} · merit rank {n}", { app: student.application.appNo, n: student.application.meritRank ?? "—" })]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words text-right font-medium [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("Update your details")} />
            <CardBody>
              <ChangeRequestForm
                fields={Object.entries(PROFILE_FIELDS).map(([key, f]) => ({ key, ...f, label: t.loose(f.label) }))}
                categories={Object.entries(CATEGORY_LABELS).map(([k, l]) => [k, t.loose(l)])}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("Correction requests")} />
            {student.profileRequests.length === 0 ? (
              <CardBody className="text-sm text-muted-foreground">{t("No requests yet.")}</CardBody>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>{t("Field")}</TH>
                    <TH>{t("Change")}</TH>
                    <TH>{t("Status")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {student.profileRequests.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-sm">{PROFILE_FIELDS[r.field] ? t.loose(PROFILE_FIELDS[r.field].label) : r.field}<div className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</div></TD>
                      <TD className="text-sm">{show(r.field, r.oldValue)} → <strong>{show(r.field, r.newValue)}</strong></TD>
                      <TD>
                        <Badge tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}>{r.status === "PENDING" ? t("With the Academic Section") : r.status === "APPROVED" ? t("Approved") : t("Rejected")}</Badge>
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
