import Link from "next/link";
import { Download } from "lucide-react";
import { requirePage } from "@/lib/session";
import { statutoryReturns } from "@/lib/reports/statutory";
import { Badge, Callout, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";

export default async function StatutoryPage({ searchParams }: PageProps<"/reports/statutory">) {
  await requirePage("/reports/statutory");
  const sp = await searchParams;
  const returns = await statutoryReturns();
  const body = returns.find((r) => r.body === sp.body) ?? returns[0];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Statutory returns"
        description="AISHE, NIRF and NAAC figures in their own formats, computed from live records each time the page opens. Download any table as CSV to fill or attach on the portal."
      />
      <nav className="flex gap-1 overflow-x-auto border-b border-border whitespace-nowrap">
        {returns.map((r) => (
          <Link key={r.body} href={`/reports/statutory?body=${r.body}`} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${r.body === body.body ? "border-brand-600 text-brand-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {r.body}
          </Link>
        ))}
      </nav>
      <Callout tone="blue" title={`${body.title} · ${body.period}`}>{body.description}</Callout>
      {body.sections.map((s) => (
        <Card key={s.code}>
          <CardHeader
            title={s.title}
            description={s.note}
            action={
              <a href={`/api/reports/statutory/${s.code}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                <Download className="h-4 w-4" /> CSV
              </a>
            }
          />
          <Table>
            <THead>
              <tr>{s.columns.map((c, i) => <TH key={c} className={i > 1 && s.code !== "NAAC-AQAR" ? "text-right" : ""}>{c}</TH>)}</tr>
            </THead>
            <tbody>
              {s.rows.map((r, i) => (
                <TR key={i}>
                  {r.map((v, j) => (
                    <TD key={j} className={`${j > 1 && s.code !== "NAAC-AQAR" ? "text-right" : ""} ${String(r[1]) === "Total" ? "font-semibold" : ""} ${s.code === "NAAC-AQAR" && j === 0 ? "font-mono text-xs" : ""}`}>
                      {s.code === "NAAC-AQAR" && j === 0 ? <Badge tone="brand">{v}</Badge> : v}
                    </TD>
                  ))}
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
