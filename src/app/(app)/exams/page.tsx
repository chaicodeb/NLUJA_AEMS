import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function ExamsPage() {
  await requirePage("/exams");
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
                  <Link href={e.type === "REGULAR" ? `/exams/${e.id}` : "/supplementary"} className="font-medium text-brand-700 hover:underline">{e.name}</Link>
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
