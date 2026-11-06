import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { ticketDetail } from "@/lib/helpdesk/helpdesk";
import { CATEGORIES, SLA, STATUS, ticketNo } from "@/lib/helpdesk/shared";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AgentControls, CloseOrReopen, ReplyBox } from "../client";

export default async function TicketPage({ params }: PageProps<"/support/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const d = await ticketDetail(id, { id: user.id, role: user.role });
  if (!d) notFound();
  const { ticket: t, agent, messages, raiser, assignee, sla } = d;
  const name = (uid: string | null) => d.people.find((p) => p.id === uid);
  const slaTone = sla.level === "breached" ? "red" : sla.level === "risk" ? "amber" : sla.level === "done" ? "green" : "blue";

  return (
    <div className="space-y-6">
      <Link href={agent ? "/helpdesk" : "/support"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {agent ? "Helpdesk queue" : "My tickets"}
      </Link>
      <PageHeader
        eyebrow={`${ticketNo(t.number)} · ${CATEGORIES[t.category]?.label}`}
        title={t.subject}
        description={`Raised by ${raiser?.name ?? "—"}${raiser ? ` (${ROLE_LABELS[raiser.role as keyof typeof ROLE_LABELS]})` : ""} on ${formatDate(t.createdAt, true)}${t.page ? ` from ${t.page}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone={SLA[t.priority].tone}>{SLA[t.priority].label} priority</Badge>
            <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Conversation" />
            <ul className="space-y-3 px-5 pb-5">
              {messages.map((m) => {
                const who = name(m.authorId);
                if (m.kind === "EVENT")
                  return (
                    <li key={m.id} className="text-center text-xs text-muted-foreground">
                      {m.body}{who ? ` — ${who.name}` : ""} · {formatDate(m.createdAt, true)}
                    </li>
                  );
                const mine = m.authorId === t.raisedById;
                return (
                  <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.internal ? "border-amber-200 bg-amber-50" : mine ? "border-border bg-white" : "border-brand-200 bg-brand-50/50"}`}>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{who?.name ?? "—"}{who && !mine ? ` · ${who.designation ?? ROLE_LABELS[who.role as keyof typeof ROLE_LABELS]}` : ""}</span>
                      <span>{m.internal ? "Internal note · " : ""}{formatDate(m.createdAt, true)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                );
              })}
            </ul>
            <CardBody className="border-t border-border"><ReplyBox id={t.id} agent={agent} closed={t.status === "CLOSED"} /></CardBody>
          </Card>
          {!agent && t.status === "RESOLVED" && t.raisedById === user.id && (
            <Card>
              <CardBody><CloseOrReopen id={t.id} /></CardBody>
            </Card>
          )}
          {t.status === "CLOSED" && t.rating && <Callout tone="green">Closed {t.closedAt ? formatDate(t.closedAt, true) : ""} · rated {t.rating}/5.</Callout>}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Service level" />
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <Badge tone={slaTone}>{sla.label}</Badge></div>
              <div className="text-xs text-muted-foreground">
                First response due {formatDate(t.responseDueAt, true)}{t.firstResponseAt ? ` · answered ${formatDate(t.firstResponseAt, true)}` : ""}
                <br />Resolution due {formatDate(t.resolveDueAt, true)}{t.resolvedAt ? ` · resolved ${formatDate(t.resolvedAt, true)}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">Handled by {CATEGORIES[t.category]?.teamLabel}{assignee ? ` — ${assignee.name}` : ""}</div>
            </CardBody>
          </Card>
          {agent && (
            <Card>
              <CardHeader title="Handle" />
              <CardBody>
                <AgentControls
                  id={t.id} status={t.status} priority={t.priority} assignedToId={t.assignedToId}
                  statuses={Object.entries(STATUS).map(([k, v]) => [k, k === "WAITING_USER" ? "Waiting for the user" : v.label])}
                  priorities={Object.entries(SLA).map(([k, v]) => [k, `${v.label} (${v.respond} h / ${v.resolve} h)`])}
                  agents={d.agents.map((a) => [a.id, `${a.name} — ${ROLE_LABELS[a.role as keyof typeof ROLE_LABELS]}`])}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
