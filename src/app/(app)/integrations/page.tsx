import { Download } from "lucide-react";
import { requirePage } from "@/lib/session";
import { abcCreditRows, integrationOverview } from "@/lib/integrations/connectors";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { OutageToggle, RetryButton, RunQueueButton } from "./client";

export default async function IntegrationsPage() {
  const user = await requirePage("/integrations");
  const [o, abc] = await Promise.all([integrationOverview(), abcCreditRows()]);
  const dl = o.connectors.find((c) => c.code === "DIGILOCKER")!;
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Connectors & DigiLocker"
        description="Outbound links to national and campus systems. All external endpoints are sandboxes in this demonstration; the data formats, queueing, retries and logs are those used in production."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting for DigiLocker" value={o.digilocker.pending} tone={o.digilocker.pending ? "amber" : "neutral"} />
        <Stat label="Delivered to DigiLocker" value={o.digilocker.delivered} tone="green" />
        <Stat label="Failed deliveries" value={o.digilocker.failed} tone={o.digilocker.failed ? "red" : "neutral"} />
        <Stat label="Students without ABC ID" value={abc.missing.length} hint="Cannot receive DigiLocker documents or ABC credits" tone={abc.missing.length ? "amber" : "green"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {o.connectors.map((c) => (
          <Card key={c.code} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{c.endpoint}</div>
              </div>
              <Badge tone={c.simulateOutage ? "red" : c.enabled ? "green" : "neutral"}>{c.simulateOutage ? "Outage (simulated)" : c.enabled ? "Connected (sandbox)" : "Off"}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{c.note}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{c.lastRunAt ? `Last run ${formatDate(c.lastRunAt, true)}` : "—"}</span>
              {isAdmin && c.code === "DIGILOCKER" && <OutageToggle code={c.code} on={!!c.simulateOutage} />}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="DigiLocker delivery queue"
          description="Grade sheets, transcripts, provisional, degree and migration certificates are queued the moment they are issued and pushed to the learner's DigiLocker account. In production a scheduler runs the queue every five minutes; failed calls are retried with exponential back-off (five attempts)."
          action={<RunQueueButton pending={o.digilocker.pending} />}
        />
        {dl.simulateOutage && <div className="px-5 pb-3"><Callout tone="red">Simulated outage is on: deliveries fail with HTTP 503 and are rescheduled.</Callout></div>}
        <Table>
          <THead>
            <tr>
              <TH>Document</TH>
              <TH>Student</TH>
              <TH>Status</TH>
              <TH>DigiLocker URI / error</TH>
              <TH className="text-right" />
            </tr>
          </THead>
          <tbody>
            {o.jobs.map((j) => (
              <TR key={j.id}>
                <TD>
                  <div className="font-medium">{j.label}</div>
                  <div className="text-xs text-muted-foreground">Queued {formatDate(j.createdAt, true)}</div>
                </TD>
                <TD className="text-sm">{j.student ? `${j.student.name} (${j.student.rollNo})` : "—"}</TD>
                <TD>
                  <Badge tone={j.status === "DELIVERED" ? "green" : j.status === "FAILED" ? "red" : "amber"}>{j.status === "DELIVERED" ? "Delivered" : j.status === "FAILED" ? "Failed" : j.attempts ? `Retry ${j.attempts}/5` : "Queued"}</Badge>
                </TD>
                <TD className="max-w-md text-xs">
                  {j.externalRef ? <span className="font-mono">{j.externalRef}</span> : <span className={j.lastError ? "text-red-700" : "text-muted-foreground"}>{j.lastError ?? "—"}</span>}
                  {j.deliveredAt && <div className="text-muted-foreground">{formatDate(j.deliveredAt, true)}</div>}
                </TD>
                <TD className="text-right">{j.status === "FAILED" && <RetryButton jobId={j.id} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Academic Bank of Credits"
          description={`${abc.rows.length.toLocaleString("en-IN")} passed-course records for ${abc.students} students from published results, in the ABC credit-upload layout (one row per course with its credits).`}
          action={
            <a href="/api/integrations/abc-export" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> ABC credit file (CSV)
            </a>
          }
        />
        {abc.missing.length > 0 && (
          <CardBody>
            <Callout tone="amber" title={`${abc.missing.length} student(s) left out — no ABC (APAAR) ID on record`}>
              {abc.missing.map((m) => `${m.name} (${m.rollNo}, ${m.batch}, ${m.credits} credits)`).join("; ")}. Collect the ID from the student; their credits and DigiLocker documents go out on the next run.
            </Callout>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
