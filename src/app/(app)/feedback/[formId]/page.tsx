import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { MANAGER_ROLES, formAnalytics } from "@/lib/feedback/feedback";
import { bandFor } from "@/lib/feedback/shared";
import { Callout, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { FormControls, QuestionEditor } from "../client";
import { Comments, QuestionBreakdown } from "../report-parts";

export default async function FeedbackFormPage({ params }: PageProps<"/feedback/[formId]">) {
  const user = await requirePage("/feedback");
  if (user.role === "FACULTY") redirect("/feedback");
  const { formId } = await params;
  const exists = await db.feedbackForm.findUnique({ where: { id: formId } });
  if (!exists) notFound();
  const { form, questions, overall, eligible, courses } = await formAnalytics(formId);
  const manager = MANAGER_ROLES.includes(user.role);
  const sorted = [...courses].sort((a, b) => (a.summary.index ?? 9) - (b.summary.index ?? 9));

  return (
    <div className="space-y-6">
      <div className="text-sm"><Link href="/feedback" className="text-brand-700 hover:underline">← Feedback & surveys</Link></div>
      <PageHeader
        eyebrow={`${form.type === "COURSE" ? "Course & teacher feedback" : form.type === "EXIT" ? "Graduate exit survey" : "Student satisfaction survey"} · ${form.academicYear}`}
        title={form.title}
        description={`${formatDate(form.opensAt)} – ${formatDate(form.closesAt)} · anonymous · results to teachers need ≥ ${form.minResponses} responses`}
        actions={
          <div className="flex flex-wrap gap-2">
            {manager && <FormControls formId={form.id} status={form.status} released={form.releasedToFaculty} />}
            {form.status !== "DRAFT" && (
              <a href={`/feedback/${form.id}/export`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                <Download className="h-3.5 w-3.5" /> NAAC 1.4 export (CSV)
              </a>
            )}
          </div>
        }
      />

      {form.status === "DRAFT" ? (
        <Card>
          <CardHeader title="Questionnaire" description={manager ? "Edit freely until the form is opened; the questions are then locked so every response answers the same questionnaire." : "Draft"} />
          {manager ? <QuestionEditor formId={form.id} initial={questions} /> : <QuestionList questions={questions.map((q) => q.text)} />}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Responses" value={`${overall.n}/${eligible}`} tone="brand" hint={form.type === "COURSE" ? "course-wise submissions" : "students"} />
            <Stat label="Response rate" value={`${eligible ? Math.round((overall.n / eligible) * 100) : 0}%`} />
            <Stat label="Overall index" value={overall.index ?? "—"} hint={bandFor(overall.index).label} tone="green" />
            <Stat label="Comments received" value={overall.comments.length} />
          </div>

          {form.type === "COURSE" && (
            <Card>
              <CardHeader title="Course & teacher index" description="Mean of all rating questions (1–5), lowest first. Open a course for question-wise results, comments and action taken." />
              <Table>
                <THead>
                  <tr>
                    <TH>Course</TH>
                    <TH>Teacher</TH>
                    <TH className="text-right">Responses</TH>
                    <TH className="w-40">Index</TH>
                    <TH />
                  </tr>
                </THead>
                <tbody>
                  {sorted.map((c) => {
                    const band = bandFor(c.summary.index);
                    return (
                      <TR key={c.id}>
                        <TD><span className="font-mono text-xs text-muted-foreground">{c.code}</span> <span className="text-sm">{c.title}</span></TD>
                        <TD className="text-sm">{c.teacher}</TD>
                        <TD className="text-right text-sm tabular-nums">{c.summary.n}/{c.enrolled} <span className="text-xs text-muted-foreground">({c.rate}%)</span></TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded bg-muted">
                              <div className={cn("h-2 rounded", band.tone === "green" ? "bg-leaf-600" : band.tone === "blue" ? "bg-sky-500" : band.tone === "amber" ? "bg-amber-500" : "bg-red-500")} style={{ width: `${((c.summary.index ?? 0) / 5) * 100}%` }} />
                            </div>
                            <span className="w-9 text-right text-sm font-semibold tabular-nums">{c.summary.index ?? "—"}</span>
                          </div>
                        </TD>
                        <TD className="text-right">
                          <Link href={`/feedback/${form.id}/courses/${c.id}`} className="text-sm text-brand-700 hover:underline">Report</Link>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}
          <QuestionBreakdown summary={overall} title={form.type === "COURSE" ? "All courses — question-wise" : "Question-wise results"} />
          {form.type !== "COURSE" && <Comments summary={overall} />}
          {form.status === "OPEN" && <Callout tone="blue">The window is open: figures update as students respond. Teachers cannot see anything until the IQAC closes the window and releases results.</Callout>}
        </>
      )}
    </div>
  );
}

function QuestionList({ questions }: { questions: string[] }) {
  return <ol className="list-decimal space-y-1 px-10 py-4 text-sm">{questions.map((q) => <li key={q}>{q}</li>)}</ol>;
}
