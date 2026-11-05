import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { DATASETS, type ReportConfig } from "@/lib/reports/datasets";
import { Callout, PageHeader } from "@/components/ui";
import { Builder } from "./builder";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requirePage("/reports");
  const { id } = await searchParams;
  const saved = await db.savedReport.findMany({ orderBy: { createdAt: "desc" } });
  const authors = await db.user.findMany({ where: { id: { in: saved.map((s) => s.createdById ?? "") } } });
  const initial = saved.find((s) => s.id === id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting & analytics"
        title="Report builder"
        description="Build institutional and statutory reports from live data — pick a dataset, columns, filters and grouping, then export or save. No vendor change request needed."
      />
      <Callout tone="blue" title="RFP Section 6.3(b) — report builder for non-technical staff">
        Datasets combine data across modules (student master, attendance, examination, results, fees). Saved reports are available to every authorised user.
      </Callout>
      <Builder
        datasets={DATASETS}
        saved={saved.map((s) => ({ id: s.id, name: s.name, description: s.description, dataset: s.dataset, config: s.config as unknown as ReportConfig, author: authors.find((a) => a.id === s.createdById)?.name ?? "—" }))}
        initial={initial ? (initial.config as unknown as ReportConfig) : undefined}
      />
    </div>
  );
}
