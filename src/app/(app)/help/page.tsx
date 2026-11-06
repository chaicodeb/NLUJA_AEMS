import Link from "next/link";
import { ArrowRight, LifeBuoy, Lightbulb, Search } from "lucide-react";
import { requirePage } from "@/lib/session";
import { TRAINING, articlesFor, type Article } from "@/lib/help/articles";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";

function ArticleCard({ a, open }: { a: Article; open: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-border bg-white">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
        <div>
          <div className="font-medium">{a.title}</div>
          <div className="text-xs text-muted-foreground">{a.summary}</div>
        </div>
        <Badge>{a.topic}</Badge>
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {a.tip && <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"><Lightbulb className="h-4 w-4 shrink-0" /> {a.tip}</p>}
        {a.path && (
          <Link href={a.path} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            Go to the screen <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </details>
  );
}

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const user = await requirePage("/help");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const path = typeof sp.path === "string" ? sp.path : undefined;
  const { here, all } = articlesFor(user.role, q, path);
  const topics = [...new Set(all.filter((a) => !here.includes(a)).map((a) => a.topic))];
  const staff = !["STUDENT", "PARENT", "APPLICANT"].includes(user.role);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Help & support"
        title="Help & training"
        description={`Step-by-step guides for your role (${ROLE_LABELS[user.role]}). Press the ? in the header on any screen to see the guides for that screen.`}
        actions={
          <Link href={`/support${path ? `?page=${encodeURIComponent(path)}` : ""}`} className={buttonVariants({ variant: "outline" })}>
            <LifeBuoy className="h-4 w-4" /> Still stuck? Raise a ticket
          </Link>
        }
      />
      <form className="flex max-w-xl gap-2">
        <Input name="q" defaultValue={q} placeholder="Search the guides, e.g. admit card, revaluation, leave" aria-label="Search help" />
        {path && <input type="hidden" name="path" value={path} />}
        <Button type="submit" variant="outline"><Search className="h-4 w-4" /> Search</Button>
      </form>
      {here.length > 0 && (
        <Card>
          <CardHeader title="For the screen you were on" description={path} />
          <div className="space-y-2 px-5 pb-5">{here.map((a) => <ArticleCard key={a.id} a={a} open />)}</div>
        </Card>
      )}
      {all.length === 0 ? (
        <EmptyState title="No guide matches" description="Try another word, or raise a ticket." />
      ) : (
        topics.map((t) => (
          <section key={t} className="space-y-2">
            <h2 className="font-serif text-lg font-semibold">{t}</h2>
            {all.filter((a) => a.topic === t && !here.includes(a)).map((a) => <ArticleCard key={a.id} a={a} open={!!q} />)}
          </section>
        ))
      )}
      {staff && (
        <Card>
          <CardHeader title="Training programme 2026-27" description="Role-wise sessions under the implementation plan; recordings and these guides remain available after each session." />
          <Table>
            <THead>
              <tr>
                <TH>Audience</TH>
                <TH>Mode</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH className="text-right">Attended</TH>
              </tr>
            </THead>
            <tbody>
              {TRAINING.map((s) => (
                <TR key={s.audience}>
                  <TD className="font-medium">{s.audience}</TD>
                  <TD className="text-sm">{s.mode}</TD>
                  <TD className="text-sm">{formatDate(new Date(s.date))}</TD>
                  <TD><Badge tone={s.status === "DONE" ? "green" : s.status === "SCHEDULED" ? "blue" : "neutral"}>{s.status === "DONE" ? "Completed" : s.status === "SCHEDULED" ? "Scheduled" : "Planned"}</Badge></TD>
                  <TD className="text-right text-sm">{s.attended}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
