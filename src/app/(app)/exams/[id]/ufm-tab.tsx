import Link from "next/link";
import { examCases } from "@/lib/exams/ufm";
import { UFM_CATEGORIES, UFM_PENALTIES, UFM_STATUS } from "@/lib/exams/ufm-shared";
import { Badge, Callout, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DecisionForm, HearingForm, ReportCaseForm } from "./ufm-client";

/** Unfair-means register for one examination. */
export async function UfmTab({ examId, role }: { examId: string; role: string }) {
  const { papers, cases } = await examCases(examId);
  const canReport = ["EXAM_STAFF", "COE"].includes(role);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Reported, notice pending" value={cases.filter((c) => c.status === "REPORTED").length} tone={cases.some((c) => c.status === "REPORTED") ? "amber" : "neutral"} />
        <Stat label="Hearing scheduled" value={cases.filter((c) => c.status === "HEARING").length} />
        <Stat label="Decided" value={cases.filter((c) => c.status === "DECIDED").length} tone="green" />
      </div>
      <Callout tone="blue" title="How a case moves">
        Invigilator&apos;s report → show-cause notice and hearing before the Unfair Means Committee → decision recorded by the Controller of Examinations. Until the decision, the result of that paper is withheld; a cancellation is applied automatically when results are processed. The student sees the notice in the portal and can submit a written explanation.
      </Callout>
      {canReport && (
        <Card>
          <CardHeader title="Record an invigilator's report" />
          <div className="p-4 sm:p-5"><ReportCaseForm papers={papers.map((p) => ({ id: p.id, code: p.course.code, title: p.course.title }))} /></div>
        </Card>
      )}
      {cases.length === 0 ? (
        <EmptyState title="No unfair-means cases in this examination" />
      ) : (
        cases.map((c) => (
          <Card key={c.id}>
            <CardHeader
              title={<span className="flex flex-wrap items-center gap-2">{c.student.name} <span className="font-mono text-xs text-muted-foreground">{c.student.rollNo}</span> · {c.paper.course.code}</span>}
              description={`${UFM_CATEGORIES[c.category] ?? c.category} · reported by ${c.reportedBy}${c.room ? ` · ${c.room}` : ""} · ${formatDate(c.createdAt, true)}`}
              action={<Badge tone={UFM_STATUS[c.status]?.tone ?? "neutral"}>{UFM_STATUS[c.status]?.label ?? c.status}</Badge>}
            />
            <div className="space-y-3 px-5 py-4 text-sm">
              <p>{c.description}</p>
              {c.material && <p className="text-xs text-muted-foreground">Material seized: {c.material}</p>}
              {c.hearingAt && <p className="text-xs">Hearing: {formatDate(c.hearingAt, true)} before {c.committee}</p>}
              {c.explanation ? (
                <div className="rounded-md bg-muted px-3 py-2 text-xs"><span className="font-medium">Student&apos;s explanation ({formatDate(c.explainedAt!, true)}):</span> {c.explanation}</div>
              ) : c.status === "HEARING" ? (
                <p className="text-xs text-muted-foreground">Awaiting the student&apos;s written explanation.</p>
              ) : null}
              {c.status === "DECIDED" && (
                <Callout tone={UFM_PENALTIES[c.penalty!]?.result === "NONE" ? "green" : "red"} title={UFM_PENALTIES[c.penalty!]?.label}>
                  {UFM_PENALTIES[c.penalty!]?.effect} · {c.decisionNote} · {formatDate(c.decidedAt!, true)}
                </Callout>
              )}
              {role === "COE" && c.status === "REPORTED" && <HearingForm caseId={c.id} />}
              {role === "COE" && c.status === "HEARING" && <DecisionForm caseId={c.id} />}
              <div className="text-xs"><Link href={`/students/${c.studentId}/exam-trail?exam=${examId}`} className="text-brand-700 hover:underline">Student&apos;s examination trail →</Link></div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
