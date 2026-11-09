import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { workflowOverview } from "@/lib/workflow/engine";
import { PROCESSES, type ProcessKey } from "@/lib/workflow/shared";
import { Badge, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Chain } from "../chain";
import { WorkflowEditor } from "./editor";

export default async function WorkflowEditPage({ params }: PageProps<"/workflows/[process]">) {
  await requirePage("/workflows");
  const { process } = await params;
  if (!(process in PROCESSES)) notFound();
  const w = (await workflowOverview()).find((x) => x.process === process)!;
  const spec = PROCESSES[process as ProcessKey];
  return (
    <div className="space-y-6">
      <Link href="/workflows" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Workflow designer
      </Link>
      <PageHeader eyebrow={`Workflow · version ${w.active.version}`} title={spec.label} description={spec.description} />
      <WorkflowEditor
        key={w.active.version}
        process={process as ProcessKey}
        initial={w.steps}
        roleLabels={Object.fromEntries(spec.roles.map((r) => [r, ROLE_LABELS[r]]))}
      />
      <Card>
        <CardHeader title="Version history" description="Every version stays on record; requests keep the version they started on" />
        <Table>
          <THead>
            <tr>
              <TH>Version</TH>
              <TH>Chain</TH>
              <TH>Reason and author</TH>
              <TH className="text-right">In progress</TH>
            </tr>
          </THead>
          <tbody>
            {w.versions.map((v) => (
              <TR key={v.id} className="align-top">
                <TD>
                  <Badge tone={v.isActive ? "green" : "neutral"}>v{v.version}{v.isActive ? " · active" : ""}</Badge>
                </TD>
                <TD><Chain process={process as ProcessKey} steps={v.steps} /></TD>
                <TD className="text-xs">
                  <div>{v.changeNote}</div>
                  <div className="text-muted-foreground">{v.by} · {formatDate(v.createdAt, true)}</div>
                </TD>
                <TD className="text-right">{v.pending}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
