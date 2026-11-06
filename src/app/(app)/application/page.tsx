import { CheckCircle2, Circle, CircleDot, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { loadCycle } from "@/lib/admissions/admissions";
import { CATEGORY_LABELS, OUTCOME_META, SEAT_LABELS, STATUS_META, docsFor, type Marks } from "@/lib/admissions/shared";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { OfferResponse, UploadDocument } from "../admissions/client";

export default async function MyApplicationPage() {
  const user = await requirePage("/application");
  const app = await db.application.findUnique({ where: { userId: user.id }, include: { documents: { omit: { data: true } } } });
  if (!app) return <EmptyState title="No application found" />;
  const cycle = await loadCycle(app.cycleId);
  const required = docsFor(cycle.docs, app);
  const published = cycle.status !== "EVALUATION" && cycle.status !== "APPLICATIONS";
  const marks = (app.marks as Marks | null) ?? {};
  const returned = app.documents.filter((d) => d.status === "REJECTED");

  const steps = [
    { label: "Application submitted", done: !!app.submittedAt, detail: app.submittedAt ? `${formatDate(app.submittedAt)} · fee ₹${cycle.applicationFee} (${app.feeRef})` : "" },
    { label: "Documents verified", done: app.status === "VERIFIED", current: ["SUBMITTED", "RETURNED"].includes(app.status), detail: app.status === "RETURNED" ? "Correction needed — see below" : app.status === "SUBMITTED" ? "With the Academic Section" : app.verifiedAt ? formatDate(app.verifiedAt) : "" },
    { label: "Entrance test and interview", done: published || cycle.rule.components.every((c) => marks[c.code] != null), detail: "Held at the University, 1–6 November 2026" },
    { label: "Merit list", done: published, current: !published && app.status === "VERIFIED", detail: published && app.meritRank ? `Rank ${app.meritRank}` : "To be published by the Registrar" },
    { label: "Admission", done: app.outcome === "ADMITTED", current: app.outcome === "OFFERED", detail: app.outcome === "OFFERED" ? "Seat offered — respond below" : "" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Application ${app.appNo}`} title={cycle.name} description={`${cycle.programme.name} · ${app.name}`} actions={<Badge tone={STATUS_META[app.status].tone}>{STATUS_META[app.status].label}</Badge>} />

      <Card>
        <ol className="grid gap-3 p-5 sm:grid-cols-5">
          {steps.map((s) => (
            <li key={s.label} className={`rounded-lg border p-3 text-sm ${s.current ? "border-brand-300 bg-brand-50" : s.done ? "border-leaf-100 bg-leaf-50" : "border-border"}`}>
              {s.done ? <CheckCircle2 className="h-4 w-4 text-leaf-600" /> : s.current ? <CircleDot className="h-4 w-4 text-brand-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <div className="mt-1 font-medium">{s.label}</div>
              {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
            </li>
          ))}
        </ol>
      </Card>

      {app.status === "RETURNED" && (
        <Callout tone="red" title="Your application needs a correction">
          {returned.length} document{returned.length === 1 ? " was" : "s were"} returned by the Academic Section. Upload a corrected file below; your application goes back for verification automatically.
        </Callout>
      )}
      {app.status === "REJECTED" && <Callout tone="red" title="Application rejected">{app.remarks}</Callout>}

      {app.outcome === "OFFERED" && (
        <Card className="border-brand-300">
          <CardHeader title={`Congratulations — you have been offered a ${SEAT_LABELS[app.seatCategory!]} seat`} description={`Merit rank ${app.meritRank} · composite ${app.composite?.toFixed(2)} · accept by ${cycle.offerDeadline ? formatDate(cycle.offerDeadline) : "the deadline"}`} />
          <CardBody className="space-y-3">
            <p className="text-sm text-muted-foreground">Accepting and paying the admission fee of ₹{cycle.admissionFee.toLocaleString("en-IN")} confirms your seat. You will receive your roll number and University ID at once, and this account becomes your student portal.</p>
            <OfferResponse fee={cycle.admissionFee} seat={SEAT_LABELS[app.seatCategory!]} />
          </CardBody>
        </Card>
      )}
      {app.outcome && app.outcome !== "OFFERED" && (
        <Callout tone={app.outcome === "WAITLISTED" ? "amber" : "blue"} title={OUTCOME_META[app.outcome].label}>
          {app.outcome === "WAITLISTED" ? `You are at merit rank ${app.meritRank}. If a seat falls vacant you will be offered it automatically and notified by e-mail and SMS.` : app.outcome === "NOT_QUALIFIED" ? "You did not reach the qualifying mark in the entrance test." : app.outcome === "DECLINED" ? "You declined the offer." : "Your admission is confirmed."}
        </Callout>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Documents" description="PDF, JPG or PNG, up to 2 MB each" />
          <ul className="divide-y divide-border">
            {required.map((spec) => {
              const d = app.documents.find((x) => x.code === spec.code);
              return (
                <li key={spec.code} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{spec.label}</div>
                      {d && (
                        <a href={`/api/admissions/doc/${d.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                          {d.fileName} · v{d.version} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={d?.status === "ACCEPTED" ? "green" : d?.status === "REJECTED" ? "red" : d ? "amber" : "neutral"}>
                        {d?.status === "ACCEPTED" ? "Verified" : d?.status === "REJECTED" ? "Returned" : d ? "Awaiting verification" : "Not uploaded"}
                      </Badge>
                      {(!d || d.status === "REJECTED") && !app.outcome && app.status !== "REJECTED" && <UploadDocument code={spec.code} label={spec.label} replace={d?.status === "REJECTED"} />}
                    </div>
                  </div>
                  {d?.status === "REJECTED" && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">Remark from the Academic Section: {d.remark}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Your application" />
          <dl className="grid gap-3 px-5 py-4 text-sm">
            {[
              ["Category", `${CATEGORY_LABELS[app.category]}${app.pwd ? " · PwD" : ""}`],
              ["Qualifying degree", `${app.qualifyingDegree}, ${app.qualifyingUniv} (${app.qualifyingYear}) — ${app.qualifyingPct}%`],
              ["Research area", app.researchArea ?? "—"],
              ["Proposal", app.proposalTitle ?? "—"],
              ["Contact", `${app.email} · ${app.phone}`],
              ...(published ? cycle.rule.components.map((c) => [c.label, marks[c.code] != null ? `${marks[c.code]} / ${c.max}` : "—"]) : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
