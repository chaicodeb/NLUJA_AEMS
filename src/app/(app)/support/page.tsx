import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePage } from "@/lib/session";
import { myTickets } from "@/lib/helpdesk/helpdesk";
import { CATEGORIES, SLA, STATUS, ticketNo } from "@/lib/helpdesk/shared";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { RaiseTicketForm } from "./client";

const OFFICER = ["ADMIN", "COE", "VC", "REGISTRAR", "EXAM_STAFF"];
/** Screen the ticket was raised from → the most likely category. */
const FROM_PAGE: [RegExp, string][] = [
  [/^\/(me\/exams|exams|evaluation|supplementary)/, "EXAMS"],
  [/^\/(me\/results|results|revaluations|moderation)/, "RESULTS"],
  [/^\/(me\/degree|convocation|me\/profile)/, "DOCUMENTS"],
  [/^\/(me\/attendance|attendance)/, "ATTENDANCE"],
  [/^\/(application|admissions|profile-requests)/, "ADMISSIONS"],
  [/^\/(me\/exit|exit|clearance)/, "FEES"],
];

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const user = await requirePage("/support");
  const sp = await searchParams;
  const tickets = await myTickets(user.id);
  const priorities = Object.entries(SLA).filter(([k]) => k !== "CRITICAL" || OFFICER.includes(user.role)).map(([k, v]) => [k, `${v.label} — reply within ${v.respond} h`] as [string, string]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Help & support" title="Support tickets" description="Tickets go straight to the office that can solve them — Examination Branch, Academic Section, Accounts or IT — with a response target set by the priority." />
      <Card>
        <CardHeader title="Raise a ticket" description="Check Help & Training first: most questions are answered there." />
        <CardBody>
          <RaiseTicketForm
            categories={Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.label} → ${v.teamLabel}`])}
            priorities={priorities}
            page={typeof sp.page === "string" ? sp.page : undefined}
            defaultCategory={
              typeof sp.category === "string" && CATEGORIES[sp.category] ? sp.category : typeof sp.page === "string" ? FROM_PAGE.find(([re]) => re.test(sp.page as string))?.[1] : undefined
            }
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="My tickets" />
        {tickets.length === 0 ? (
          <EmptyState title="No tickets yet" />
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/40">
                  <div>
                    <div className="font-medium"><span className="font-mono text-xs text-muted-foreground">{ticketNo(t.number)}</span> {t.subject}</div>
                    <div className="text-xs text-muted-foreground">{CATEGORIES[t.category]?.label} · raised {formatDate(t.createdAt, true)}{t.sla.level !== "done" ? ` · ${t.sla.label}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={SLA[t.priority].tone}>{SLA[t.priority].label}</Badge>
                    <Badge tone={STATUS[t.status].tone}>{t.status === "WAITING_USER" ? "Waiting for you" : STATUS[t.status].label}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
