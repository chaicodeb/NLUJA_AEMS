import { Download } from "lucide-react";
import { requirePage } from "@/lib/session";
import { POLICY, backupOverview } from "@/lib/admin/backup";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { BackupNowButton, RestoreButton, VerifyButton } from "../client";

const size = (b: number | null) => (b == null ? "—" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const KIND: Record<string, string> = { SCHEDULED: "Nightly", MANUAL: "Manual", PRE_RESTORE: "Safety (before restore)" };

export default async function BackupPage() {
  await requirePage("/admin/backup");
  const o = await backupOverview();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Backup & restore"
        description="Complete logical backups of the database — every table, compressed and fingerprinted with SHA-256 — taken nightly by the built-in scheduler and on demand. Any backup can be verified, downloaded for off-site storage, or restored."
        actions={<BackupNowButton />}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Last good backup" value={o.ageHours == null ? "None" : o.ageHours < 1 ? "< 1 h ago" : `${Math.round(o.ageHours)} h ago`} hint={o.lastOk ? formatDate(o.lastOk.startedAt, true) : undefined} tone={o.ageHours != null && o.ageHours <= POLICY.rpoHours ? "green" : "red"} />
        <Stat label="Next nightly backup" value={<span className="text-xl">{o.nextRun.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>} hint={formatDate(o.nextRun)} tone="brand" />
        <Stat label="Recovery objectives" value={<span className="text-xl">RPO {POLICY.rpoHours} h · RTO {POLICY.rtoHours} h</span>} hint="As required by the RFP" />
        <Stat label="Stored on this server" value={size(o.diskBytes)} hint={`Newest ${POLICY.retain} kept`} />
      </div>
      <Callout tone="blue" title="Policy">
        Nightly at 0{POLICY.scheduleHourIst}:00 IST; the newest {POLICY.retain} backups are kept and older ones pruned automatically. In production each file is also copied to the disaster-recovery site and object storage in India, and a restore is rehearsed every quarter. Files here: <span className="font-mono text-xs">{o.dir}</span>
      </Callout>
      <Card>
        <CardHeader title="Backups" description="Restore replaces all data; a safety backup of the current state is taken first." />
        <Table>
          <THead>
            <tr>
              <TH>Taken</TH>
              <TH>Type</TH>
              <TH>Contents</TH>
              <TH>Fingerprint</TH>
              <TH>Status</TH>
              <TH className="text-right" />
            </tr>
          </THead>
          <tbody>
            {o.runs.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="text-sm font-medium">{formatDate(r.startedAt, true)}</div>
                  <div className="text-xs text-muted-foreground">{r.by}{r.durationMs != null ? ` · ${(r.durationMs / 1000).toFixed(1)} s` : ""}</div>
                </TD>
                <TD className="text-sm">{KIND[r.kind] ?? r.kind}{r.note && <div className="max-w-56 text-xs text-muted-foreground">{r.note}</div>}</TD>
                <TD className="text-sm">{r.tables != null ? `${r.tables} tables · ${r.rows?.toLocaleString("en-IN")} rows · ${size(r.sizeBytes)}` : "—"}</TD>
                <TD className="font-mono text-xs">{r.sha256 ? `${r.sha256.slice(0, 16)}…` : r.error ?? "—"}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={r.status === "OK" ? "green" : r.status === "FAILED" ? "red" : r.status === "PRUNED" ? "neutral" : "amber"}>{r.status === "OK" ? "Available" : r.status === "PRUNED" ? "Pruned" : r.status === "FAILED" ? "Failed" : "Running"}</Badge>
                    {r.verifiedAt && <Badge tone="blue">Verified {formatDate(r.verifiedAt)}</Badge>}
                    {r.restoredAt && <Badge tone="violet">Restored {formatDate(r.restoredAt, true)}</Badge>}
                  </div>
                </TD>
                <TD className="text-right">
                  {r.status === "OK" && (
                    <div className="flex justify-end gap-1.5">
                      <VerifyButton id={r.id} />
                      <a href={`/api/admin/backup/${r.id}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted">
                        <Download className="h-3.5 w-3.5" /> File
                      </a>
                      <RestoreButton id={r.id} label={`the ${formatDate(r.startedAt, true)} backup`} />
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
        {o.runs.length === 0 && <CardBody className="text-sm text-muted-foreground">No backups yet.</CardBody>}
      </Card>
    </div>
  );
}
