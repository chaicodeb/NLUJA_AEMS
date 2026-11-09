import Link from "next/link";
import { requirePage } from "@/lib/session";
import { workflowOverview } from "@/lib/workflow/engine";
import { Badge, Callout, Card, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Chain } from "./chain";

export default async function WorkflowsPage() {
  await requirePage("/workflows");
  const items = await workflowOverview();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rules"
        title="Workflow designer"
        description="Approval chains are configuration, not code. The Academic Section, Registrar or Controller of Examinations can add a step, change who approves it, make it apply only in some cases, or set its target — and the system enforces the new chain at once."
      />
      <Callout tone="blue" title="How changes take effect">
        Every save is a new version with a recorded reason, written to the audit trail with the old and new chain. Requests already in progress finish on the version they started with; new requests follow the new version. The person who approved one step can never approve the next step of the same request.
      </Callout>
      {items.map((w) => (
        <Card key={w.process}>
          <CardHeader
            title={w.spec.label}
            description={w.spec.description}
            action={
              <div className="flex items-center gap-2">
                <Badge tone="brand">Version {w.active.version}</Badge>
                <Link href={`/workflows/${w.process}`} className={buttonVariants({ size: "sm" })}>Edit</Link>
              </div>
            }
          />
          <div className="space-y-3 px-5 py-4">
            <Chain process={w.process} steps={w.steps} />
            <div className="text-xs text-muted-foreground">
              Last changed {formatDate(w.active.createdAt, true)} by {w.versions[0]?.by ?? "System"} — “{w.active.changeNote}” · decided on <Link href={w.spec.screen} className="text-brand-700 hover:underline">{w.spec.screen}</Link>
              {w.versions.some((v) => v.pending) && <> · in progress: {w.versions.filter((v) => v.pending).map((v) => `${v.pending} on v${v.version}`).join(", ")}</>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
