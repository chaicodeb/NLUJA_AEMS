import Link from "next/link";
import { Gavel } from "lucide-react";
import { requirePage } from "@/lib/session";
import { listCompetitions } from "@/lib/moot/moot";
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";

export default async function MootPage() {
  await requirePage("/moot");
  const comps = await listCompetitions();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academics"
        title="Moot court"
        description="Teams, memorials, court-hall scheduling, judges' score sheets, automatic team rankings and awards — with the scores flowing into the moot course's internal marks."
      />
      {comps.length === 0 ? (
        <EmptyState title="No moot competitions yet" />
      ) : (
        comps.map((c) => (
          <Card key={c.id}>
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><Gavel className="h-4 w-4 text-brand-700" /> {c.name}</span>}
              description={c.problem}
              action={<Link href={`/moot/${c.id}`} className={buttonVariants({ size: "sm" })}>Open</Link>}
            />
            <div className="flex flex-wrap gap-2 px-5 py-4 text-xs">
              <Badge tone="brand">{c.teams.length} teams</Badge>
              <Badge tone="neutral">{c.teams.reduce((a, t) => a + t.members.length, 0)} students</Badge>
              <Badge tone="green">{c.rounds.filter((r) => r.status === "SCORED").length} rounds scored</Badge>
              <Badge tone="amber">{c.rounds.filter((r) => r.status !== "SCORED").length} to be scored</Badge>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
