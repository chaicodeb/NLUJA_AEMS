import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { JsonDiff } from "../../audit/json-diff";
import { RuleEditor } from "./rule-editor";

export default async function RuleDetailPage({ params }: PageProps<"/rules/[key]">) {
  const user = await requirePage("/rules");
  const { key } = await params;
  const versions = await db.ruleSet.findMany({ where: { key }, orderBy: { version: "desc" }, include: { programme: true } });
  if (!versions.length) notFound();
  const active = versions.find((v) => v.isActive) ?? versions[0];
  const authors = await db.user.findMany({ where: { id: { in: versions.map((v) => v.createdById ?? "") } } });
  const canEdit = ["ADMIN", "COE", "ACADEMIC_STAFF"].includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Rule ${active.key} · ${active.programme?.name ?? "All programmes"}`}
        title={active.name}
        description={active.description ?? undefined}
        actions={<Badge tone="green">Version {active.version} active</Badge>}
      />
      <RuleEditor ruleKey={active.key} type={active.type} params={active.params as Record<string, unknown>} canEdit={canEdit} />
      <Card>
        <CardHeader title="Version history" description="Every version is retained. Results and eligibility decisions record the exact rule version they were computed with." />
        <ol className="divide-y divide-border">
          {versions.map((v, i) => {
            const prev = versions[i + 1];
            return (
              <li key={v.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={v.isActive ? "green" : "neutral"}>v{v.version}</Badge>
                    <span className="font-medium">{v.changeNote}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {authors.find((a) => a.id === v.createdById)?.name ?? "—"} · {formatDate(v.createdAt, true)}
                  </span>
                </div>
                {prev && <JsonDiff before={prev.params} after={v.params} />}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
