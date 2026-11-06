import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePage } from "@/lib/session";
import { cycleOverview, eligibilityOf, meritPreview, qualifies } from "@/lib/admissions/admissions";
import { CATEGORY_LABELS, CYCLE_STATUS, OUTCOME_META, SEAT_LABELS, STATUS_META, docsFor, isRelaxed, type Marks } from "@/lib/admissions/shared";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { MarksGrid, PublishMeritButton } from "../client";

const TABS = [
  { key: "applications", label: "Applications & verification" },
  { key: "marks", label: "Test & interview marks" },
  { key: "merit", label: "Merit & allotment" },
  { key: "setup", label: "Seat matrix & rules" },
];

export default async function CyclePage({ params, searchParams }: PageProps<"/admissions/[cycleId]">) {
  const user = await requirePage("/admissions");
  const { cycleId } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "applications";
  const o = await cycleOverview(cycleId);
  const { cycle } = o;
  const st = CYCLE_STATUS[cycle.status] ?? CYCLE_STATUS.CLOSED;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Admissions · ${cycle.academicYear}`}
        title={cycle.name}
        description={`${cycle.programme.name} · applications ${formatDate(cycle.opensAt)} – ${formatDate(cycle.closesAt)} · fee ₹${cycle.applicationFee.toLocaleString("en-IN")}`}
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Applications" value={o.counts.submitted} hint={`${o.counts.total - o.counts.submitted} unsubmitted draft(s)`} tone="brand" />
        <Stat label="Awaiting verification" value={o.counts.toVerify} tone={o.counts.toVerify ? "amber" : "neutral"} />
        <Stat label="Returned to applicant" value={o.counts.returned} tone={o.counts.returned ? "red" : "neutral"} />
        <Stat label="Verified" value={o.counts.verified} hint={`${o.qualified} qualified the entrance test`} tone="green" />
        <Stat label="Seats" value={o.seatsTotal} hint={o.seatFill.map((s) => `${s.cat} ${s.seats}`).join(" · ")} />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admissions/${cycleId}?tab=${t.key}`} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "applications" && <Applications o={o} status={typeof sp.status === "string" ? sp.status : undefined} />}
      {tab === "marks" && <MarksTab o={o} canEdit={["HOD", "ACADEMIC_STAFF", "REGISTRAR", "ADMIN"].includes(user.role)} />}
      {tab === "merit" && <MeritTab cycleId={cycleId} canPublish={["REGISTRAR", "ADMIN"].includes(user.role)} />}
      {tab === "setup" && <SetupTab o={o} />}
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof cycleOverview>>;

function Applications({ o, status }: { o: Overview; status?: string }) {
  const rows = o.apps.filter((a) => a.status !== "DRAFT" && (!status || a.status === status));
  const filters = [["", "All"], ["SUBMITTED", "Awaiting verification"], ["RETURNED", "Returned"], ["VERIFIED", "Verified"], ["REJECTED", "Rejected"]];
  return (
    <Card>
      <CardHeader title="Applications" description="Open an application to check documents against the eligibility conditions." />
      <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
        {filters.map(([k, label]) => (
          <Link key={k} href={`/admissions/${o.cycle.id}?tab=applications${k ? `&status=${k}` : ""}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${(status ?? "") === k ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No applications in this view" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Application</TH>
              <TH>Candidate</TH>
              <TH>Qualifying degree</TH>
              <TH>Documents</TH>
              <TH>Status</TH>
              <TH className="text-right" />
            </tr>
          </THead>
          <tbody>
            {rows.map((a) => {
              const required = docsFor(o.cycle.docs, a);
              const accepted = a.documents.filter((d) => d.status === "ACCEPTED" && required.some((r) => r.code === d.code)).length;
              const elig = eligibilityOf(a, o.cycle.rule);
              return (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">{a.appNo}</TD>
                  <TD>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[a.category]}{a.pwd ? " · PwD" : ""} · {a.domicile}</div>
                  </TD>
                  <TD className="text-sm">
                    {a.qualifyingDegree} {a.qualifyingPct}%{" "}
                    {!elig.ok && <Badge tone="red">Below {elig.min}%</Badge>}
                    <div className="text-xs text-muted-foreground">{a.qualifyingUniv}, {a.qualifyingYear}</div>
                  </TD>
                  <TD><Badge tone={accepted === required.length ? "green" : "amber"}>{accepted}/{required.length} accepted</Badge></TD>
                  <TD>
                    <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
                    {a.outcome && <div className="mt-1"><Badge tone={OUTCOME_META[a.outcome].tone}>{OUTCOME_META[a.outcome].label}{a.meritRank ? ` · rank ${a.meritRank}` : ""}</Badge></div>}
                  </TD>
                  <TD className="text-right">
                    <Link href={`/admissions/${o.cycle.id}/applications/${a.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                      {a.status === "SUBMITTED" ? "Verify" : "Open"} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function MarksTab({ o, canEdit }: { o: Overview; canEdit: boolean }) {
  const rows = o.apps.filter((a) => ["SUBMITTED", "RETURNED", "VERIFIED"].includes(a.status));
  const testComp = o.cycle.rule.components.find((c) => c.code === o.cycle.rule.qualifying.code)!;
  const locked = o.cycle.status !== "EVALUATION" || !canEdit;
  return (
    <Card>
      <CardHeader
        title="Entrance test and interview marks"
        description={`Test marks are imported from the OMR scanner. Only candidates scoring ${o.cycle.rule.qualifying.pct}% in the test (${o.cycle.rule.qualifying.relaxedPct}% for reserved categories and PwD) are called for interview.`}
        action={<Badge tone={o.pendingMarks.length ? "amber" : "green"}>{o.pendingMarks.length ? `${o.pendingMarks.length} pending` : "Complete"}</Badge>}
      />
      {locked && o.cycle.status !== "EVALUATION" && <div className="px-5 pb-3"><Callout tone="blue">The merit list has been published; marks are locked.</Callout></div>}
      <MarksGrid
        cycleId={o.cycle.id}
        locked={locked}
        components={o.cycle.rule.components.map((c) => ({ code: c.code, label: c.label, max: c.max, testOnly: c.code === testComp.code }))}
        rows={rows
          .map((a) => ({ a, q: qualifies(a, o.cycle.rule) }))
          .sort((x, y) => Number(x.q === false) - Number(y.q === false) || x.a.appNo.localeCompare(y.a.appNo))
          .map(({ a, q }) => ({
            id: a.id, appNo: a.appNo, name: a.name, category: CATEGORY_LABELS[a.category], qualified: q,
            relaxedNote: `${a.pwd ? " · PwD" : ""}${a.status !== "VERIFIED" ? ` · ${STATUS_META[a.status].label.toLowerCase()}` : ""}`,
            values: (a.marks as Marks | null) ?? {},
          }))}
      />
    </Card>
  );
}

async function MeritTab({ cycleId, canPublish }: { cycleId: string; canPublish: boolean }) {
  const p = await meritPreview(cycleId);
  const { cycle } = p;
  const published = cycle.status !== "EVALUATION";
  const offers = p.ranked.filter((r) => r.seat).length;
  const unverified = (await cycleOverview(cycleId)).apps.filter((a) => ["SUBMITTED", "RETURNED"].includes(a.status));
  const test = cycle.rule.qualifying.code;
  return (
    <div className="space-y-4">
      {!published && (
        <>
          {p.blockers.length > 0 ? (
            <Callout tone="amber" title={`Marks pending for ${p.blockers.length} candidate(s)`}>
              {p.blockers.map((b) => b.name).join(", ")} — enter their marks on the <Link href={`/admissions/${cycleId}?tab=marks`} className="font-medium underline">marks tab</Link> before publishing. The list below is provisional.
            </Callout>
          ) : (
            <Callout tone="green" title="Ready to publish">All verified candidates have their marks. Publishing sends offers to the candidates holding seats and locks marks.</Callout>
          )}
          {unverified.length > 0 && (
            <Callout tone="blue">
              {unverified.length} application(s) are not yet verified ({unverified.map((a) => a.name).join(", ")}) and are not on this list. Verify them first if they should be considered.
            </Callout>
          )}
        </>
      )}
      <Card>
        <CardHeader
          title={published ? "Published merit list" : "Provisional merit list"}
          description={`Composite = ${cycle.rule.components.map((c) => `${c.weight}% ${c.label.toLowerCase()}`).join(" + ")}. Open-merit seats are filled first in rank order; reserved seats then go to the next candidates of each category. Ties: higher test score, then higher LL.M. %, then the older candidate.`}
          action={!published && canPublish && p.blockers.length === 0 ? <PublishMeritButton cycleId={cycleId} offers={offers} /> : published ? <Badge tone="green">Published {cycle.meritPublishedAt ? formatDate(cycle.meritPublishedAt) : ""}</Badge> : undefined}
        />
        <div className="grid gap-3 border-b border-border px-5 py-3 sm:grid-cols-5">
          {Object.entries(cycle.seats).map(([cat, n]) => {
            const holders = p.ranked.filter((r) => r.seat === cat);
            return (
              <div key={cat} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">{SEAT_LABELS[cat]}</div>
                <div className="font-semibold">{holders.length}/{n} filled</div>
                <div className="text-xs text-muted-foreground">{holders.length ? `Last rank ${holders.at(-1)!.rank}` : "No eligible candidate"}</div>
              </div>
            );
          })}
        </div>
        {p.ranked.length === 0 ? (
          <EmptyState title="No ranked candidates yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="text-right">Rank</TH>
                <TH>Candidate</TH>
                <TH>Category</TH>
                {cycle.rule.components.map((c) => <TH key={c.code} className="text-right">{c.code === test ? "Test" : "Interview"}</TH>)}
                <TH className="text-right">Composite</TH>
                <TH>Seat</TH>
              </tr>
            </THead>
            <tbody>
              {p.ranked.map((r) => (
                <TR key={r.id} className={r.seat ? "" : "text-muted-foreground"}>
                  <TD className="text-right font-semibold">{r.rank}</TD>
                  <TD>
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="font-mono text-xs">{r.appNo}</div>
                  </TD>
                  <TD className="text-sm">{CATEGORY_LABELS[r.category]}{r.pwd ? " · PwD" : ""}</TD>
                  {cycle.rule.components.map((c) => <TD key={c.code} className="text-right">{(r.marks as Marks)[c.code]}</TD>)}
                  <TD className="text-right font-semibold text-foreground">{r.composite!.toFixed(2)}</TD>
                  <TD>
                    {r.outcome && published ? (
                      <Badge tone={OUTCOME_META[r.outcome].tone}>{OUTCOME_META[r.outcome].label}{r.seat ? ` · ${r.seat}` : ""}</Badge>
                    ) : r.seat ? (
                      <Badge tone={r.seat === "UR" ? "brand" : "violet"}>{SEAT_LABELS[r.seat]}</Badge>
                    ) : (
                      <Badge tone="amber">Waitlist</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        {p.notQualified.length > 0 && (
          <CardBody className="border-t border-border text-xs text-muted-foreground">
            Did not reach the qualifying mark in the test ({p.notQualified.length}): {p.notQualified.map((a) => `${a.name} (${(a.marks as Marks)[test]}${isRelaxed(a) ? ", relaxed" : ""})`).join(", ")}.
          </CardBody>
        )}
      </Card>
    </div>
  );
}

function SetupTab({ o }: { o: Overview }) {
  const { cycle } = o;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Seat matrix" description="Central reservation: 15% SC, 7.5% ST, 27% OBC-NCL, 10% EWS; PwD horizontal." />
        <Table>
          <THead>
            <tr>
              <TH>Category</TH>
              <TH className="text-right">Seats</TH>
              <TH className="text-right">Offered</TH>
              <TH className="text-right">Admitted</TH>
            </tr>
          </THead>
          <tbody>
            {o.seatFill.map((s) => (
              <TR key={s.cat}>
                <TD>{s.label}</TD>
                <TD className="text-right">{s.seats}</TD>
                <TD className="text-right">{s.offered}</TD>
                <TD className="text-right">{s.admitted}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Merit and eligibility rule" description={cycle.rule.regulation} />
        <CardBody className="space-y-2 text-sm">
          <p><strong>Eligibility:</strong> {cycle.rule.eligibility.degree} with {cycle.rule.eligibility.minPct}% ({cycle.rule.eligibility.relaxedMinPct}% for SC/ST/OBC-NCL/EWS/PwD).</p>
          <p><strong>Qualifying test mark:</strong> {cycle.rule.qualifying.pct}% ({cycle.rule.qualifying.relaxedPct}% relaxed) to be called for interview.</p>
          <ul className="list-disc pl-5">
            {cycle.rule.components.map((c) => <li key={c.code}>{c.label}: out of {c.max}, weight {c.weight}%</li>)}
          </ul>
          <p><strong>Fees:</strong> application ₹{cycle.applicationFee.toLocaleString("en-IN")}, admission ₹{cycle.admissionFee.toLocaleString("en-IN")}.</p>
        </CardBody>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Document checklist" description="Shown to applicants and used for verification; conditional documents apply only when relevant." />
        <ul className="divide-y divide-border text-sm">
          {cycle.docs.map((d) => (
            <li key={d.code} className="flex items-center justify-between px-5 py-2.5">
              <span>{d.label}{d.hint && <span className="text-xs text-muted-foreground"> · {d.hint}</span>}</span>
              <Badge tone={d.when ? "blue" : "neutral"}>{d.when === "RESERVED" ? "Reserved categories" : d.when === "PWD" ? "PwD only" : "All applicants"}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
