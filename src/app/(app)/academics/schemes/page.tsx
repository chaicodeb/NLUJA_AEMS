import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";

const SOURCE_LABEL: Record<string, string> = { FACULTY: "Faculty entry", EXAM: "On-screen evaluation", EXTERNAL: "External examiner", SYSTEM: "Computed by system" };

export default async function SchemesPage() {
  await requirePage("/academics/schemes");
  const schemes = await db.evaluationScheme.findMany({
    orderBy: { code: "asc" },
    include: { components: { orderBy: { sortOrder: "asc" } }, _count: { select: { courses: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic Management"
        title="Evaluation schemes"
        description="Assessment components, maximum marks and component-wise pass marks per NLUJA's published academic regulations. Each component declares where its marks come from."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        {schemes.map((s) => {
          const total = s.components.reduce((a, c) => a + c.maxMarks, 0);
          return (
            <Card key={s.id}>
              <CardHeader
                title={s.name}
                description={s.description}
                action={
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={s.passRule === "AGGREGATE" ? "blue" : "violet"}>
                      {s.passRule === "AGGREGATE" ? `Pass: ${s.aggregatePassPct}% aggregate` : "Pass: every component + aggregate"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s._count.courses} course(s)</span>
                  </div>
                }
              />
              <Table>
                <THead>
                  <tr>
                    <TH>Component</TH>
                    <TH className="text-right">Max</TH>
                    <TH className="text-right">Pass</TH>
                    <TH>Group</TH>
                    <TH>Source</TH>
                  </tr>
                </THead>
                <tbody>
                  {s.components.map((c) => {
                    const sub = (c.subCriteria as { name: string; max: number }[] | null) ?? [];
                    return (
                      <TR key={c.id}>
                        <TD>
                          <div className="font-medium">{c.name}</div>
                          {sub.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {sub.map((x) => (
                                <span key={x.name} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {x.name} ({x.max})
                                </span>
                              ))}
                            </div>
                          )}
                        </TD>
                        <TD className="text-right">{c.maxMarks}</TD>
                        <TD className="text-right">{c.passMarks ?? <span className="text-muted-foreground">—</span>}</TD>
                        <TD><Badge>{c.group}</Badge></TD>
                        <TD className="text-muted-foreground">{SOURCE_LABEL[c.source]}</TD>
                      </TR>
                    );
                  })}
                  <TR className="bg-muted/40 font-medium">
                    <TD>Total</TD>
                    <TD className="text-right">{total}</TD>
                    <TD className="text-right">{s.passRule === "AGGREGATE" ? (total * s.aggregatePassPct) / 100 : `${s.aggregatePassPct}%`}</TD>
                    <TD colSpan={2} />
                  </TR>
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
