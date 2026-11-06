import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { IMPORT_KINDS } from "@/lib/integrations/migration";
import { Badge, Callout, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CommitButton, RollbackButton } from "../../client";

const KEY_COLS: Record<string, string[]> = { STUDENTS: ["roll_no", "uid", "name", "batch_code"], RESULTS: ["roll_no", "semester", "course_code", "marks", "grade", "sgpa"] };

export default async function ImportBatchPage({ params, searchParams }: PageProps<"/integrations/migration/[batchId]">) {
  const user = await requirePage("/integrations/migration");
  const { batchId } = await params;
  const sp = await searchParams;
  const filter = typeof sp.show === "string" ? sp.show : "ISSUES";
  const batch = await db.importBatch.findUnique({ where: { id: batchId }, include: { rows: { orderBy: { rowNo: "asc" } } } });
  if (!batch) notFound();
  const spec = IMPORT_KINDS[batch.kind];
  const rows = batch.rows.filter((r) => (filter === "ALL" ? true : filter === "ISSUES" ? r.status !== "VALID" : r.status === filter));
  const clean = batch.validCount + batch.warningCount;
  const cols = KEY_COLS[batch.kind];

  return (
    <div className="space-y-6">
      <Link href="/integrations/migration" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Data migration
      </Link>
      <PageHeader
        eyebrow={`${spec.label} · staged ${formatDate(batch.createdAt, true)}`}
        title={batch.fileName}
        actions={
          <div className="flex flex-wrap gap-2">
            {batch.errorCount + batch.warningCount > 0 && (
              <a href={`/api/integrations/import/${batch.id}/errors`} className={buttonVariants({ variant: "outline" })}>
                <Download className="h-4 w-4" /> Rows to fix (CSV)
              </a>
            )}
            {batch.status === "STAGED" && <CommitButton batchId={batch.id} rows={clean} skipped={batch.errorCount} />}
            {batch.status === "COMMITTED" && ["ADMIN", "REGISTRAR"].includes(user.role) && <RollbackButton batchId={batch.id} />}
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Rows" value={batch.rowCount} tone="brand" />
        <Stat label="Valid" value={batch.validCount} tone="green" />
        <Stat label="With warnings" value={batch.warningCount} hint="Written, with the issue recorded" tone={batch.warningCount ? "amber" : "neutral"} />
        <Stat label="With errors" value={batch.errorCount} hint="Left out; fix and upload again" tone={batch.errorCount ? "red" : "neutral"} />
      </div>
      {batch.status === "STAGED" ? (
        <Callout tone="blue" title="Reconciliation">
          Nothing has been written yet. Rows with errors will be left out{batch.kind === "RESULTS" ? " — and so will the rest of that student's semester, because a semester is migrated only when complete" : ""}. Download the rows to fix, correct them in the source system and upload them again.
        </Callout>
      ) : batch.status === "COMMITTED" ? (
        <Callout tone="green" title={`Committed ${batch.committedAt ? formatDate(batch.committedAt, true) : ""}`}>{clean} row(s) are now in the live records{batch.kind === "RESULTS" ? " (legacy result run), with SGPA and CGPA recomputed" : ""}. The Registrar can roll the import back if it was made in error.</Callout>
      ) : (
        <Callout tone="amber" title="Rolled back">Every record created by this import was removed {batch.rolledBackAt ? formatDate(batch.rolledBackAt, true) : ""}.</Callout>
      )}
      <Card>
        <CardHeader
          title="Rows"
          action={
            <div className="flex gap-1 text-xs">
              {[["ISSUES", "Issues"], ["ERROR", "Errors"], ["WARNING", "Warnings"], ["ALL", "All"]].map(([k, l]) => (
                <Link key={k} href={`/integrations/migration/${batch.id}?show=${k}`} className={`rounded-full border px-3 py-1 ${filter === k ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground"}`}>{l}</Link>
              ))}
            </div>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH className="text-right">Row</TH>
              {cols.map((c) => <TH key={c}>{c}</TH>)}
              <TH>Status</TH>
              <TH>Reconciliation</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => {
              const d = r.data as Record<string, string>;
              return (
                <TR key={r.id}>
                  <TD className="text-right text-xs text-muted-foreground">{r.rowNo}</TD>
                  {cols.map((c) => <TD key={c} className="font-mono text-xs">{d[c] || "—"}</TD>)}
                  <TD><Badge tone={r.status === "VALID" ? "green" : r.status === "WARNING" ? "amber" : "red"}>{r.status === "VALID" ? "Valid" : r.status === "WARNING" ? "Warning" : "Error"}</Badge></TD>
                  <TD className="max-w-lg text-xs">
                    {r.messages.length ? r.messages.map((m) => <div key={m} className={m.startsWith("✖") ? "text-red-700" : "text-amber-800"}>{m.replace(/^✖ /, "")}</div>) : <span className="text-muted-foreground">OK</span>}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
