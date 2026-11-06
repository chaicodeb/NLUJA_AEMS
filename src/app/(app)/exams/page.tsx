import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { PlanExamForm } from "./plan-form";

export default async function ExamsPage() {
  const user = await requirePage("/exams");
  const exams = await db.exam.findMany({
    where: { code: { not: "LEGACY-MIGRATION" } },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { papers: true, registrations: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examination Management"
        title="Examinations"
        description="Regular, repeat, re-registered, special and improvement examinations are configured independently, each with its own eligibility, fee and result rules."
        actions={["COE", "ADMIN"].includes(user.role) ? <PlanExamForm /> : undefined}
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Examination</TH>
              <TH>Type</TH>
              <TH>Window</TH>
              <TH className="text-right">Papers</TH>
              <TH className="text-right">Registrations</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {exams.map((e) => (
              <TR key={e.id}>
                <TD className="font-mono text-xs">{e.code}</TD>
                <TD>
                  <Link href={e.type !== "REGULAR" ? "/supplementary" : e.status === "PLANNED" ? `/exams/${e.id}/timetable` : `/exams/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.name}</Link>
                  <div className="text-xs text-muted-foreground">
                    {e.type === "REGULAR" && (
                      <Link href={`/exams/${e.id}/timetable`} className="hover:underline">
                        Timetable {e.timetablePublishedAt ? "· published" : "· not published"}
                      </Link>
                    )}
                  </div>
                </TD>
                <TD><Badge>{e.type === "REPEAT" ? "SUPPLEMENTARY" : e.type}</Badge></TD>
                <TD className="text-sm">{formatDate(e.startDate)} – {formatDate(e.endDate)}</TD>
                <TD className="text-right">{e._count.papers}</TD>
                <TD className="text-right">{e._count.registrations}</TD>
                <TD><Badge tone="brand">{e.status.replace("_", " ")}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
