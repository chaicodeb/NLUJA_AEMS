import { Download, Search } from "lucide-react";
import { requirePage } from "@/lib/session";
import { SECTORS, alumniOverview } from "@/lib/alumni/alumni";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Select, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export default async function AlumniPage({ searchParams }: PageProps<"/alumni">) {
  await requirePage("/alumni");
  const sp = await searchParams;
  const year = Number(sp.year) || undefined;
  const sector = typeof sp.sector === "string" && SECTORS[sp.sector] ? sp.sector : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const a = await alumniOverview({ year, sector, q });
  const maxSector = Math.max(1, ...a.bySector.map((s) => s.count));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student services"
        title="Alumni"
        description="Graduates of the University since the first batch: records migrated from earlier years plus profiles graduates maintain themselves. Feeds NAAC criterion 5.2 (student progression) and NIRF graduation outcomes."
        actions={
          <a href="/api/alumni/export" className={buttonVariants({ variant: "outline" })}>
            <Download className="h-4 w-4" /> NAAC 5.2 export (CSV)
          </a>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Alumni on record" value={a.total} hint={`${a.years.length} graduating years`} tone="brand" />
        <Stat label="Placed / practising" value={pct(a.placed, a.total)} hint={`${a.placed} alumni`} tone="green" />
        <Stat label="Higher studies" value={pct(a.higher, a.total)} hint={`${a.higher} alumni`} />
        <Stat label="Qualified competitive exams" value={a.exams} hint={`Judicial, NET, civil services, CLAT PG · ${a.mentors} volunteer mentors`} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Progression by graduating year" description="NAAC 5.2.1 (placement) and 5.2.2 (progression to higher education)" />
          <Table>
            <THead>
              <tr>
                <TH>Year</TH>
                <TH className="text-right">Alumni</TH>
                <TH className="text-right">Placed</TH>
                <TH className="text-right">Higher studies</TH>
                <TH className="text-right">Exams qualified</TH>
              </tr>
            </THead>
            <tbody>
              {a.byYear.map((y) => (
                <TR key={y.year}>
                  <TD className="font-medium">{y.year}</TD>
                  <TD className="text-right">{y.total}</TD>
                  <TD className="text-right">{y.placed} <span className="text-xs text-muted-foreground">({pct(y.placed, y.total)})</span></TD>
                  <TD className="text-right">{y.higher}</TD>
                  <TD className="text-right">{y.exams}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Where our alumni are" description="By sector of current work or study" />
          <CardBody className="space-y-2.5">
            {a.bySector
              .sort((x, y) => y.count - x.count)
              .map((s) => (
                <div key={s.key} className="text-sm">
                  <div className="flex justify-between">
                    <span>{s.label}</span>
                    <span className="text-muted-foreground">{s.count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(s.count / maxSector) * 100}%` }} />
                  </div>
                </div>
              ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Alumni directory" description={`${a.list.length} of ${a.total} shown`} />
        <form className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <Input name="q" defaultValue={q} placeholder="Name, organisation, city…" className="h-9 w-60" />
          <Select name="year" defaultValue={year ?? ""} className="h-9 w-36">
            <option value="">All years</option>
            {a.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select name="sector" defaultValue={sector ?? ""} className="h-9 w-64">
            <option value="">All sectors</option>
            {Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Button size="sm" type="submit" variant="outline">
            <Search className="h-3.5 w-3.5" /> Filter
          </Button>
        </form>
        {a.list.length === 0 ? (
          <EmptyState title="No alumni match the filter" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Year</TH>
                <TH>Now</TH>
                <TH>City</TH>
                <TH>Exams</TH>
                <TH>Contact</TH>
              </tr>
            </THead>
            <tbody>
              {a.list.slice(0, 60).map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.programme === "LLM" ? "LL.M." : "B.A. LL.B."}
                      {p.source === "MIGRATED" ? " · migrated record" : " · self-updated"}
                      {p.mentor && " · mentor"}
                    </div>
                  </TD>
                  <TD>{p.graduationYear}</TD>
                  <TD className="text-sm">
                    {p.designation && <div>{p.designation}</div>}
                    <div className="text-xs text-muted-foreground">{p.organisation ?? SECTORS[p.sector]?.label}</div>
                  </TD>
                  <TD className="text-sm">{p.city ?? "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">{p.qualifiedExams.map((e) => <Badge key={e} tone="violet">{e}</Badge>)}</div>
                  </TD>
                  <TD className="text-xs">{p.directoryConsent ? <a href={`mailto:${p.email}`} className="text-brand-700 hover:underline">{p.email}</a> : <span className="text-muted-foreground">Not listed (no consent)</span>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
