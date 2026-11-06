import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CYCLE_STATUS } from "@/lib/admissions/shared";

export default async function AdmissionsPage() {
  await requirePage("/admissions");
  const cycles = await db.admissionCycle.findMany({ include: { programme: true, _count: { select: { applications: { where: { status: { not: "DRAFT" } } } } } }, orderBy: { opensAt: "desc" } });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Academics" title="Admissions" description="Each admission cycle carries its own seat matrix, document checklist and merit rule, configured by the University." />
      {cycles.length === 0 ? (
        <EmptyState title="No admission cycles" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cycles.map((c) => {
            const st = CYCLE_STATUS[c.status] ?? CYCLE_STATUS.CLOSED;
            const seats = Object.values(c.seatMatrix as Record<string, number>).reduce((a, b) => a + b, 0);
            return (
              <Link key={c.id} href={`/admissions/${c.id}`} className="block">
                <Card className="p-5 transition hover:border-brand-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-serif text-lg font-semibold">{c.name}</div>
                      <div className="text-sm text-muted-foreground">{c.programme.name}</div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {c._count.applications} applications · {seats} seats · applications {formatDate(c.opensAt)} – {formatDate(c.closesAt)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
