import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { IMPORT_KINDS } from "@/lib/integrations/migration";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ImportUploader } from "../client";

export default async function MigrationPage() {
  await requirePage("/integrations/migration");
  const batches = await db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const users = await db.user.findMany({ where: { id: { in: batches.map((b) => b.createdById) } }, select: { id: true, name: true } });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Data migration"
        description="Bring records over from the legacy system (Samarth, tabulation registers, spreadsheets). Every file is staged and reconciled first; nothing reaches the live records until you commit, and a committed import can be rolled back."
      />
      <Card>
        <CardHeader title="Upload a file" description="Import students first, then their historical results." />
        <CardBody className="space-y-3">
          <ImportUploader kinds={Object.entries(IMPORT_KINDS).map(([k, v]) => [k, v.label])} />
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {Object.values(IMPORT_KINDS).map((k) => <li key={k.label}><strong>{k.label}:</strong> {k.columns.join(", ")}. {k.help}</li>)}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Imports" />
        {batches.length === 0 ? (
          <EmptyState title="No imports yet" description="Download the demo legacy file above and upload it to see the reconciliation." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>File</TH>
                <TH>Type</TH>
                <TH>Rows</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {batches.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <div className="font-medium">{b.fileName}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(b.createdAt, true)} · {users.find((u) => u.id === b.createdById)?.name}</div>
                  </TD>
                  <TD className="text-sm">{IMPORT_KINDS[b.kind]?.label}</TD>
                  <TD className="text-sm">
                    {b.rowCount} · <span className="text-leaf-700">{b.validCount} valid</span> · <span className="text-amber-700">{b.warningCount} warnings</span> · <span className="text-red-700">{b.errorCount} errors</span>
                  </TD>
                  <TD><Badge tone={b.status === "COMMITTED" ? "green" : b.status === "ROLLED_BACK" ? "neutral" : "amber"}>{b.status === "STAGED" ? "Awaiting commit" : b.status === "COMMITTED" ? "Committed" : "Rolled back"}</Badge></TD>
                  <TD className="text-right">
                    <Link href={`/integrations/migration/${b.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
