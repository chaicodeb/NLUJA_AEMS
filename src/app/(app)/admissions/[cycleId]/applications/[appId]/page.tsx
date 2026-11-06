import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { eligibilityOf, loadCycle, qualifies } from "@/lib/admissions/admissions";
import { CATEGORY_LABELS, OUTCOME_META, STATUS_META, docsFor, type Marks } from "@/lib/admissions/shared";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DocumentReview, RejectApplicationForm } from "../../../client";

export default async function ApplicationReviewPage({ params }: PageProps<"/admissions/[cycleId]/applications/[appId]">) {
  const user = await requirePage("/admissions");
  const { cycleId, appId } = await params;
  const app = await db.application.findUnique({ where: { id: appId }, include: { documents: { omit: { data: true } } } });
  if (!app || app.cycleId !== cycleId) notFound();
  const cycle = await loadCycle(cycleId);
  const required = docsFor(cycle.docs, app);
  const elig = eligibilityOf(app, cycle.rule);
  const marks = (app.marks as Marks | null) ?? {};
  const q = qualifies(app, cycle.rule);
  const canVerify = ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"].includes(user.role) && ["SUBMITTED", "RETURNED", "VERIFIED"].includes(app.status) && !app.outcome;
  const history = await db.auditLog.findMany({ where: { entity: "Application", entityId: app.id }, orderBy: { id: "desc" }, include: { actor: true }, take: 12 });

  return (
    <div className="space-y-6">
      <Link href={`/admissions/${cycleId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {cycle.name}
      </Link>
      <PageHeader
        eyebrow={app.appNo}
        title={app.name}
        description={`${CATEGORY_LABELS[app.category]}${app.pwd ? " · PwD" : ""} · ${app.gender === "F" ? "Female" : "Male"} · born ${formatDate(app.dob)} · ${app.domicile}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_META[app.status].tone}>{STATUS_META[app.status].label}</Badge>
            {app.outcome && <Badge tone={OUTCOME_META[app.outcome].tone}>{OUTCOME_META[app.outcome].label}</Badge>}
          </div>
        }
      />
      {app.status === "REJECTED" && <Callout tone="red" title="Application rejected">{app.remarks}</Callout>}
      {!elig.ok && app.status !== "REJECTED" && (
        <Callout tone="red" title="Does not meet the eligibility condition">
          {elig.detail}. Reject the application with the reason, or verify the marksheet if the percentage was entered wrongly.
        </Callout>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Documents" description={`${required.length} required for this applicant · open each file and compare with the form`} />
          <ul className="divide-y divide-border">
            {required.map((spec) => {
              const d = app.documents.find((x) => x.code === spec.code);
              return (
                <li key={spec.code} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{spec.label}</div>
                      {d ? (
                        <a href={`/api/admissions/doc/${d.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                          {d.fileName} · {Math.ceil(d.size / 1024)} KB · v{d.version} · {formatDate(d.uploadedAt, true)} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <div className="text-xs text-red-700">Not uploaded</div>
                      )}
                    </div>
                    <Badge tone={d?.status === "ACCEPTED" ? "green" : d?.status === "REJECTED" ? "red" : "amber"}>{d?.status === "ACCEPTED" ? "Accepted" : d?.status === "REJECTED" ? "Returned" : "To verify"}</Badge>
                  </div>
                  {d?.status === "REJECTED" && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{d.remark}</div>}
                  {d && canVerify && d.status !== "ACCEPTED" && <DocumentReview docId={d.id} label={spec.label} />}
                </li>
              );
            })}
          </ul>
          {canVerify && (
            <CardBody className="flex justify-end border-t border-border">
              <RejectApplicationForm applicationId={app.id} suggestion={elig.ok ? "" : `Ineligible: ${elig.detail}.`} />
            </CardBody>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Application form" description={`Submitted ${app.submittedAt ? formatDate(app.submittedAt, true) : "—"} · fee ${app.feeRef ?? "unpaid"}`} />
            <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-2">
              {[
                ["Qualifying degree", `${app.qualifyingDegree}, ${app.qualifyingUniv} (${app.qualifyingYear})`],
                ["Percentage", `${app.qualifyingPct}%`],
                ["UGC-NET / JRF", app.netQualified ? "Qualified" : "No"],
                ["Research area", app.researchArea ?? "—"],
                ["Proposal", app.proposalTitle ?? "—"],
                ["Parent / guardian", app.parentName],
                ["E-mail", app.email],
                ["Mobile", app.phone],
                ["Address", app.address],
              ].map(([k, v]) => (
                <div key={k} className={k === "Proposal" || k === "Address" ? "sm:col-span-2" : ""}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Checks" />
            <ul className="space-y-2 px-5 py-4 text-sm">
              <li className="flex gap-2">{elig.ok ? <CheckCircle2 className="h-4 w-4 text-leaf-600" /> : <XCircle className="h-4 w-4 text-red-600" />} {elig.detail}</li>
              {cycle.rule.components.map((c) => (
                <li key={c.code} className="flex gap-2">
                  {marks[c.code] != null ? <CheckCircle2 className="h-4 w-4 text-leaf-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  {c.label}: {marks[c.code] != null ? `${marks[c.code]}/${c.max}` : c.code === cycle.rule.qualifying.code ? "not available" : q === false ? "not called (below qualifying mark)" : "pending"}
                </li>
              ))}
              {app.meritRank && <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> Merit rank {app.meritRank} · composite {app.composite?.toFixed(2)}</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="History" description="From the audit trail" />
            <ul className="divide-y divide-border text-sm">
              {history.length === 0 && <li className="px-5 py-3 text-muted-foreground">No actions yet.</li>}
              {history.map((h) => (
                <li key={h.id} className="px-5 py-2.5">
                  <div className="text-xs text-muted-foreground">{formatDate(h.at, true)} · {h.actor?.name ?? "System"}</div>
                  <div>{h.summary}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
