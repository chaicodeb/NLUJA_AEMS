import Link from "next/link";
import { requirePage } from "@/lib/session";
import { queue } from "@/lib/helpdesk/helpdesk";
import { CATEGORIES, SLA, STATUS, ticketNo } from "@/lib/helpdesk/shared";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const FILTERS = [["open", "Open"], ["mine", "Assigned to me"], ["closed", "Resolved & closed"], ["all", "All"]];

export default async function HelpdeskPage({ searchParams }: PageProps<"/helpdesk">) {
  const user = await requirePage("/helpdesk");
  const sp = await searchParams;
  const filter = typeof sp.f === "string" && FILTERS.some(([k]) => k === sp.f) ? sp.f : "open";
  const { list, stats, users } = await queue({ id: user.id, role: user.role }, filter);
  const who = (id: string | null) => users.find((u) => u.id === id)?.name ?? "—";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Help & support"
        title="Helpdesk queue"
        description={user.role === "ADMIN" ? "All tickets across the Examination Branch, Academic Section, Accounts and IT, most urgent first." : "Tickets for your office and those assigned to you, most urgent first."}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Open" value={stats.open} tone="brand" />
        <Stat label="SLA breached" value={stats.breached} tone={stats.breached ? "red" : "green"} />
        <Stat label="At risk" value={stats.risk} hint="Less than a quarter of the time left" tone={stats.risk ? "amber" : "neutral"} />
        <Stat label="Average first response" value={stats.avgResponseH == null ? "—" : `${stats.avgResponseH.toFixed(1)} h`} hint={stats.withinSla != null ? `${stats.withinSla}% resolved within SLA` : undefined} />
        <Stat label="User satisfaction" value={stats.csat == null ? "—" : `${stats.csat.toFixed(1)} / 5`} tone="green" />
      </div>
      <Card>
        <CardHeader
          title="Tickets"
          action={
            <div className="flex gap-1 text-xs">
              {FILTERS.map(([k, l]) => (
                <Link key={k} href={`/helpdesk?f=${k}`} className={`rounded-full border px-3 py-1 ${filter === k ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground"}`}>{l}</Link>
              ))}
            </div>
          }
        />
        {list.length === 0 ? (
          <EmptyState title="Nothing here" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Ticket</TH>
                <TH>Raised by</TH>
                <TH>Priority</TH>
                <TH>Status</TH>
                <TH>Service level</TH>
                <TH>Assigned</TH>
              </tr>
            </THead>
            <tbody>
              {list.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/support/${t.id}`} className="font-medium text-brand-700 hover:underline">
                      <span className="font-mono text-xs">{ticketNo(t.number)}</span> {t.subject}
                    </Link>
                    <div className="text-xs text-muted-foreground">{CATEGORIES[t.category]?.label} · {formatDate(t.createdAt, true)}</div>
                  </TD>
                  <TD className="text-sm">{who(t.raisedById)}<div className="text-xs text-muted-foreground">{users.find((u) => u.id === t.raisedById)?.role.replace("_", " ").toLowerCase()}</div></TD>
                  <TD><Badge tone={SLA[t.priority].tone}>{SLA[t.priority].label}</Badge></TD>
                  <TD><Badge tone={STATUS[t.status].tone}>{t.status === "WAITING_USER" ? "Waiting for user" : STATUS[t.status].label}</Badge></TD>
                  <TD><Badge tone={t.sla.level === "breached" ? "red" : t.sla.level === "risk" ? "amber" : t.sla.level === "done" ? "green" : "neutral"}>{t.sla.label}</Badge></TD>
                  <TD className="text-sm">{who(t.assignedToId)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
