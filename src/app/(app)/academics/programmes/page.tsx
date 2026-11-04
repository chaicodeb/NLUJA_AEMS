import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR, Callout } from "@/components/ui";

const CATEGORY_TONE: Record<string, "brand" | "green" | "blue" | "violet" | "amber" | "neutral"> = {
  CORE: "brand", CLINICAL: "green", MOOT: "green", HONOURS: "violet", OPTIONAL: "blue", HSS: "neutral", SPECIALIZATION: "violet", DISSERTATION: "amber",
};

export default async function ProgrammesPage() {
  await requirePage("/academics/programmes");
  const programmes = await db.programme.findMany({
    orderBy: { code: "asc" },
    include: {
      curricula: {
        orderBy: { effectiveFrom: "asc" },
        include: {
          batches: true,
          courses: { orderBy: [{ semester: "asc" }, { code: "asc" }], include: { scheme: true, faculty: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic Management"
        title="Programmes & curriculum versions"
        description="Multiple curriculum versions run side by side. Each batch stays on the curriculum it was admitted under, so a revision never alters the records of earlier batches."
      />
      <Callout tone="blue" title="Curriculum versioning in action">
        The 2022 B.A. LL.B. batch is evaluated on the 2019 curriculum (5 credits per course), while the 2025 batch follows the revised 2025-26 curriculum (4 credits per course, 212 credits) — processed in the same examination cycle.
      </Callout>
      {programmes.map((p) => (
        <Card key={p.id}>
          <CardHeader title={p.name} description={`${p.code} · ${p.level} · ${p.durationSemesters} semesters`} />
          {p.curricula.length === 0 && <div className="px-5 py-4 text-sm text-muted-foreground">No curriculum configured in this demo.</div>}
          {p.curricula.map((c) => (
            <div key={c.id} className="border-t border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-5 py-3">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.notes}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="brand">{c.code}</Badge>
                  <Badge>Effective {c.effectiveFrom}{c.effectiveTo ? `–${c.effectiveTo}` : " onwards"}</Badge>
                  <Badge>{c.creditsPerCourse} credits / course</Badge>
                  {c.batches.map((b) => (
                    <Badge key={b.id} tone="green">{b.name}</Badge>
                  ))}
                </div>
              </div>
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Course</TH>
                    <TH>Sem</TH>
                    <TH>Category</TH>
                    <TH className="text-right">Credits</TH>
                    <TH>Evaluation scheme</TH>
                    <TH>Faculty</TH>
                  </tr>
                </THead>
                <tbody>
                  {c.courses.map((course) => (
                    <TR key={course.id}>
                      <TD className="font-mono text-xs">{course.code}</TD>
                      <TD className="font-medium">{course.title}</TD>
                      <TD>{course.semester}</TD>
                      <TD><Badge tone={CATEGORY_TONE[course.category]}>{course.category}</Badge></TD>
                      <TD className="text-right">{course.credits}</TD>
                      <TD className="text-muted-foreground">{course.scheme.name}</TD>
                      <TD className="text-muted-foreground">{course.faculty?.name ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
