import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR, Callout } from "@/components/ui";

export default async function ProgrammesPage() {
  await requirePage("/academics/programmes");
  const programmes = await db.programme.findMany({
    orderBy: { code: "asc" },
    include: { curricula: { orderBy: { effectiveFrom: "asc" }, include: { batches: true, courses: { select: { credits: true, semester: true } } } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic Management"
        title="Programmes & curriculum versions"
        description="Multiple curriculum versions run side by side. Each batch stays on the curriculum it was admitted under, so a revision never alters the records of earlier batches."
      />
      <Callout tone="blue" title="Curriculum versioning in action">
        The 2022 B.A. LL.B. batch is evaluated on the 2019 curriculum (5 credits per course), while the 2025 batch follows the revised 2025-26 curriculum (4 credits per course, 212 credits) — processed in the same examination cycle. A revision starts as a draft copy and takes effect only after Academic Council approval.
      </Callout>
      {programmes.map((p) => (
        <Card key={p.id}>
          <CardHeader title={p.name} description={`${p.code} · ${p.level} · ${p.durationSemesters} semesters${p.degreeTitle ? ` · ${p.degreeTitle}` : ""}`} />
          {p.curricula.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">No curriculum configured.</div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Version</TH>
                  <TH>Status</TH>
                  <TH>Effective</TH>
                  <TH className="text-right">Courses</TH>
                  <TH className="text-right">Credits</TH>
                  <TH>Batches</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {p.curricula.map((c) => {
                  const credits = c.courses.reduce((a, x) => a + x.credits, 0);
                  const sems = new Set(c.courses.map((x) => x.semester)).size;
                  return (
                    <TR key={c.id}>
                      <TD>
                        <div className="font-medium">{c.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{c.code}</div>
                      </TD>
                      <TD>
                        <Badge tone={c.status === "DRAFT" ? "amber" : "green"}>{c.status === "DRAFT" ? "Draft" : "Approved"}</Badge>
                        {c.approvalRef && <div className="mt-1 text-xs text-muted-foreground">{c.approvalRef}</div>}
                      </TD>
                      <TD className="text-sm">{c.effectiveFrom}{c.effectiveTo ? `–${c.effectiveTo}` : " onwards"}</TD>
                      <TD className="text-right">{c.courses.length}<div className="text-xs text-muted-foreground">{sems}/{p.durationSemesters} semesters</div></TD>
                      <TD className="text-right">{credits}{c.totalCredits ? <span className="text-xs text-muted-foreground"> / {c.totalCredits}</span> : null}</TD>
                      <TD><div className="flex flex-wrap gap-1">{c.batches.map((b) => <Badge key={b.id} tone="blue">{b.code}</Badge>)}</div></TD>
                      <TD className="text-right">
                        <Link href={`/academics/curricula/${c.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ))}
    </div>
  );
}
