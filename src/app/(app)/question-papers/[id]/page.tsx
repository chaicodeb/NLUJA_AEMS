import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Fingerprint, FileDown, LockKeyhole, ShieldX } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { QP_LABEL, QP_STEPS, QP_TONE, checksFor, contextFor, decryptContent, hashContent, loadPaper, logContentView, releaseOpensAt, rightsNow } from "@/lib/exams/question-paper";
import { blocking } from "@/lib/exams/question-paper-checks";
import { QuestionPaperView } from "@/components/question-paper-view";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { ChecksList } from "./checks-list";
import { Editor } from "./editor";
import { ModerationPanel, ReleaseButton, SealButton } from "./workflow";
import { StartButton } from "../start-button";

export default async function QuestionPaperPage({ params }: PageProps<"/question-papers/[id]">) {
  const user = await requirePage("/question-papers");
  const { id } = await params;
  const p = await loadPaper(id);
  if (!p) notFound();
  if (user.role === "FACULTY" && p.setterId !== user.id) return <EmptyState title="Not your paper" description="Faculty can open only the question papers they have been appointed to set." />;
  const rights = rightsNow(user, p);
  const qp = p.questionPaper;
  const back = (
    <Link href="/question-papers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Question papers
    </Link>
  );
  if (!qp) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState title={`${p.course.code} — not started`} description={`${p.setter?.name ?? "The setter"} has not started drafting this paper yet.`} />
        {rights.start && <StartButton id={p.id} />}
      </div>
    );
  }

  const content = rights.viewContent ? decryptContent(qp.body) : null;
  const intact = content ? hashContent(content) === qp.contentHash : null;
  if (content) await logContentView(qp.id, p.course.code, user);
  const checks = content ? checksFor(p, content) : null;
  const history = await db.auditLog.findMany({ where: { entity: "QuestionPaper", entityId: qp.id }, orderBy: { id: "desc" }, take: 40, include: { actor: true } });
  const opens = releaseOpensAt(p);
  const header = {
    exam: p.exam.name, code: p.course.code, title: p.course.title,
    when: `${formatDate(p.date)} · ${p.session === "FN" ? "Forenoon" : "Afternoon"} session`, durationMins: p.durationMins, maxMarks: p.maxMarks,
  };
  const step = qp.status === "CHANGES_REQUESTED" ? 0 : QP_STEPS.findIndex((s) => s.status === qp.status);
  const scheme = (p.questionScheme as { q: string; max: number }[] | null) ?? [];
  const released = qp.status === "RELEASED";

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        eyebrow={`Question paper · ${p.exam.code} · version ${qp.version}`}
        title={`${p.course.code} — ${p.course.title}`}
        description={`${header.when} · ${p.durationMins} minutes · ${p.maxMarks} marks · Setter: ${p.setter?.name ?? "—"}${qp.moderatorName ? ` · Moderator: ${qp.moderatorName}` : ""}`}
        actions={
          content && !rights.edit ? (
            <a href={`/api/question-papers/${p.id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              <FileDown className="h-4 w-4" /> {released ? "Print copy (PDF)" : "Draft PDF (watermarked)"}
            </a>
          ) : undefined
        }
      />

      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {QP_STEPS.map((s, i) => (
          <li key={s.status} className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 ${i < step ? "border-leaf-200 bg-leaf-50 text-leaf-700" : i === step ? "border-brand-300 bg-brand-50 font-semibold text-brand-700" : "border-border text-muted-foreground"}`}>
              {i + 1}. {s.label}
            </span>
            {i < QP_STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </li>
        ))}
        <li><Badge tone={QP_TONE[rights.status]}>{QP_LABEL[rights.status]}</Badge></li>
      </ol>

      {qp.status === "CHANGES_REQUESTED" && qp.moderatorNote && (
        <Callout tone="amber" title={`Returned by the moderator, ${qp.moderatorName ?? ""}`}>{qp.moderatorNote}</Callout>
      )}
      {["APPROVED", "SEALED", "RELEASED"].includes(qp.status) && qp.moderatorNote && (
        <Callout tone="green" title={`Moderator's comments — ${qp.moderatorName ?? ""}`}>{qp.moderatorNote}</Callout>
      )}
      {content && ["SEALED", "RELEASED"].includes(qp.status) && (
        intact ? (
          <Callout tone="green" title="Sealed content verified">
            <span className="inline-flex items-center gap-1.5"><Fingerprint className="h-4 w-4 shrink-0" /> The decrypted paper matches the fingerprint recorded when it was sealed ({qp.contentHash.slice(0, 16)}…). Nobody has altered it since {formatDate(qp.sealedAt ?? qp.updatedAt, true)}.</span>
          </Callout>
        ) : (
          <Callout tone="red" title="Integrity failure">
            <span className="inline-flex items-center gap-1.5"><ShieldX className="h-4 w-4 shrink-0" /> The stored paper does not match its sealed fingerprint. Do not print — inform the Controller of Examinations.</span>
          </Callout>
        )
      )}

      {!content && (
        <Card>
          <CardHeader title="Contents sealed from you" />
          <div className="space-y-3 p-4 text-sm sm:p-5">
            <p className="inline-flex items-start gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /> The question paper is encrypted. Only its setter, the moderator and the Controller of Examinations can read it before release.</p>
            <p className="text-muted-foreground">Fingerprint (SHA-256): <span className="font-mono">{qp.contentHash.slice(0, 32)}…</span></p>
            {qp.status === "SEALED" && (rights.release ? <ReleaseButton id={p.id} /> : <p className="text-muted-foreground">Release for printing opens at {formatDate(opens, true)} — one hour before the paper.</p>)}
          </div>
        </Card>
      )}

      {content && rights.edit && <Editor id={p.id} initial={content} ctx={contextFor(p)} header={header} version={qp.version} />}

      {content && !rights.edit && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-2 lg:col-span-3">
            <div className="text-sm font-medium text-muted-foreground">Candidate&apos;s view {released ? "" : "(preview — not visible to students)"}</div>
            <QuestionPaperView content={content} header={header} watermark={released ? undefined : `DRAFT v${qp.version} — NOT FOR DISTRIBUTION`} />
          </div>
          <div className="min-w-0 space-y-4 lg:col-span-2">
            {checks && (
              <Card>
                <CardHeader title="Automatic checks" description={blocking(checks).length ? `${blocking(checks).length} blocking` : "No blocking issues"} />
                <ChecksList checks={checks} />
              </Card>
            )}
            {rights.moderate && (
              <Card>
                <CardHeader title="Moderate this paper" description="Approve it for sealing, or return it to the setter" />
                <ModerationPanel id={p.id} hasWarnings={!!checks?.some((c) => c.level === "warn")} />
              </Card>
            )}
            {(rights.seal || qp.status === "SEALED") && ["COE", "EXAM_STAFF"].includes(user.role) && (
              <Card>
                <CardHeader title={rights.seal ? "Seal the paper" : "Release for printing"} />
                <div className="space-y-3 p-4 text-sm sm:p-5">
                  {rights.seal ? (
                    <>
                      <p className="text-muted-foreground">Sealing locks the content, records its fingerprint and regenerates the evaluators&apos; marking scheme from the paper. The paper can then only be released one hour before it starts.</p>
                      <SealButton id={p.id} />
                    </>
                  ) : rights.release ? (
                    <ReleaseButton id={p.id} />
                  ) : (
                    <p className="text-muted-foreground">Release opens at {formatDate(opens, true)} — one hour before the paper. The fingerprint is re-verified at release.</p>
                  )}
                </div>
              </Card>
            )}
            <Card>
              <CardHeader title="Marking-scheme dry run" description="What evaluators will see on their marking screen" />
              <Table>
                <THead>
                  <tr>
                    <TH>Question</TH>
                    <TH>Unit</TH>
                    <TH>Paper</TH>
                    <TH>Marking screen</TH>
                  </tr>
                </THead>
                <tbody>
                  {content.questions.map((q, i) => {
                    const s = scheme[i];
                    const ok = s && s.q === q.no && s.max === q.marks;
                    return (
                      <TR key={q.no}>
                        <TD className="font-medium">{q.no}{q.orText !== undefined ? " (a/b)" : ""}</TD>
                        <TD className="text-xs">{q.unit}</TD>
                        <TD>{q.marks}</TD>
                        <TD className={ok ? "text-leaf-700" : "text-amber-700"}>{s ? `${s.q} / ${s.max}` : "—"}{ok ? " ✓" : ""}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
              <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
                {checks?.find((c) => c.id === "scheme")?.level === "pass" ? "The marking screen already matches this paper." : "Sealing the paper will regenerate the marking screen to match it (only while no scripts have been evaluated)."}
              </p>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="History" description="Every save, view, preview, decision and print — from the tamper-evident audit trail" />
        <ol className="divide-y divide-border">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm sm:px-5">
              <span className="w-36 shrink-0 text-xs text-muted-foreground">{formatDate(h.at, true)}</span>
              <Badge tone={/DENIED/.test(h.action) ? "red" : /SEALED|RELEASED|MODERATED/.test(h.action) ? "green" : /VIEWED|PREVIEWED|PRINTED/.test(h.action) ? "violet" : "neutral"}>{h.action}</Badge>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{h.summary}</span>
              <span className="text-xs text-muted-foreground">{h.actor?.name ?? "System"}{h.actorRole ? ` · ${ROLE_LABELS[h.actorRole as Role]}` : ""} · #{h.id}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
