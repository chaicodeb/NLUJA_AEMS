import { Award, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { DEPARTMENTS, currentConvocation, graduands, medalWinners, type Medal } from "@/lib/convocation/degree";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ClearDuesButton, ConferButton, FreezeListForm } from "./client";

export const maxDuration = 120;

const STATUS: Record<string, { label: string; tone: "neutral" | "amber" | "blue" | "green" }> = {
  PLANNING: { label: "Planning", tone: "neutral" },
  APPLICATIONS_OPEN: { label: "Applications open", tone: "amber" },
  LIST_FROZEN: { label: "Graduand list frozen", tone: "blue" },
  DEGREES_ISSUED: { label: "Degrees conferred", tone: "green" },
};

export default async function ConvocationPage() {
  const user = await requirePage("/convocation");
  const conv = await currentConvocation();
  if (!conv) return <EmptyState title="No convocation scheduled" />;
  const rows = await graduands(conv.id);
  const medals = await medalWinners(conv.medals as unknown as Medal[], rows);
  const degrees = await db.document.findMany({ where: { type: "DEGREE", refId: { in: rows.map((r) => r.application?.id ?? "") } } });
  const approved = rows.filter((r) => r.application?.status === "APPROVED").length;
  const canClear = ["REGISTRAR", "ADMIN"].includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Registrar · Convocation"
        title={conv.title}
        description={`${formatDate(conv.date)} · ${conv.venue}${conv.chiefGuest ? ` · Chief Guest: ${conv.chiefGuest}` : ""}`}
        actions={<Badge tone={STATUS[conv.status].tone}>{STATUS[conv.status].label}</Badge>}
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Graduating students" value={rows.length} tone="brand" hint="Batches that completed the programme" />
        <Stat label="Eligible for the degree" value={rows.filter((r) => r.eligible).length} tone="green" />
        <Stat label="Applications" value={rows.filter((r) => r.application).length} hint={`Deadline ${formatDate(conv.applicationDeadline)}`} />
        <Stat label="Degrees issued" value={degrees.length} tone={degrees.length ? "green" : "neutral"} />
      </div>

      {conv.status === "APPLICATIONS_OPEN" && canClear && (
        <Card className="p-5">
          <div className="mb-2 font-medium">Freeze the graduand list</div>
          <p className="mb-3 text-sm text-muted-foreground">Every application is re-checked against the degree requirements at this moment: semesters, backlog, credits, minimum CGPA and no-dues. Eligible graduands get a degree serial number; the others are recorded with the reason.</p>
          <FreezeListForm convocationId={conv.id} />
        </Card>
      )}
      {conv.status === "LIST_FROZEN" && (
        <Callout tone="blue" title={`List frozen under ${conv.councilResolution}`}>
          {approved} graduand(s) approved. {user.role === "VC" ? "Confer the degrees to sign and issue the certificates." : "Awaiting the Vice-Chancellor's signature."}
          {user.role === "VC" && <div className="mt-3"><ConferButton convocationId={conv.id} count={approved} /></div>}
        </Callout>
      )}
      {conv.status === "DEGREES_ISSUED" && (
        <Callout tone="green" title="Degrees conferred">{degrees.length} digitally signed degree certificates issued {conv.issuedAt ? `on ${formatDate(conv.issuedAt, true)}` : ""}; queued for DigiLocker / NAD.</Callout>
      )}

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Award className="h-4 w-4 text-amber-600" /> Medals</span>} description="Computed from the published results of eligible graduands who cleared every paper at the first attempt" />
        <ul className="divide-y divide-border">
          {medals.map((m) => (
            <li key={m.medal.code} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <div className="font-medium">{m.medal.name}</div>
                <div className="text-xs text-muted-foreground">{m.medal.description}</div>
              </div>
              <div className="text-right">
                {m.winners.length ? m.winners.map((w) => <div key={w.studentId}><span className="font-semibold">{w.name}</span> <span className="text-xs text-muted-foreground">({w.score})</span></div>) : <span className="text-xs text-muted-foreground">No eligible candidate</span>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Graduands" description="Live degree-eligibility check for every student of the graduating batches" />
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH className="text-right">CGPA</TH>
              <TH>Requirements</TH>
              <TH>Application</TH>
              <TH>Degree</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => {
              const failing = r.checks.filter((c) => !c.ok);
              const doc = degrees.find((d) => d.refId === r.application?.id);
              return (
                <TR key={r.student.id}>
                  <TD>
                    <div className="font-medium">{r.student.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.student.rollNo} · {r.student.batch.code}</div>
                  </TD>
                  <TD className="text-right">
                    <div className="font-semibold tabular-nums">{r.cgpa.toFixed(2)}</div>
                    <div className="text-[11px] text-muted-foreground">{r.division ?? "—"}</div>
                  </TD>
                  <TD className="max-w-xs">
                    {failing.length === 0 ? (
                      <Badge tone="green">All requirements met</Badge>
                    ) : (
                      <div className="space-y-1">
                        {failing.map((c) => (
                          <div key={c.label} className="text-xs text-red-700">
                            {c.label}: {c.detail}
                          </div>
                        ))}
                        {canClear && r.dues.filter((d) => d.row?.status === "DUES").map((d) => (
                          <ClearDuesButton key={d.department} studentId={r.student.id} department={d.department} label={DEPARTMENTS[d.department]} />
                        ))}
                      </div>
                    )}
                  </TD>
                  <TD>
                    {r.application ? (
                      <div className="space-y-1 text-xs">
                        <Badge tone={r.application.status === "APPROVED" ? "green" : r.application.status === "NOT_ELIGIBLE" ? "red" : "amber"}>
                          {r.application.status === "APPROVED" ? `Approved · ${r.application.serialNo}` : r.application.status === "NOT_ELIGIBLE" ? "Not eligible" : "Applied"}
                        </Badge>
                        <div className="text-muted-foreground">{r.application.mode === "IN_PERSON" ? `In person · ${r.application.guests} guest(s)` : "In absentia"} · ₹{r.application.fee}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not applied</span>
                    )}
                  </TD>
                  <TD>
                    {doc ? (
                      <a href={`/api/degree/${doc.id}`} target="_blank" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        <Download className="h-3.5 w-3.5" /> {doc.verifyCode}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
