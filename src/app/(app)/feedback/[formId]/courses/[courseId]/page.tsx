import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePage } from "@/lib/session";
import { facultyVisibility, questionsOf } from "@/lib/feedback/feedback";
import { bandFor, summarise } from "@/lib/feedback/shared";
import { Badge, Callout, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ActionTakenForm } from "../../../client";
import { Comments, QuestionBreakdown } from "../../../report-parts";

export default async function CourseFeedbackPage({ params }: PageProps<"/feedback/[formId]/courses/[courseId]">) {
  const user = await requirePage("/feedback");
  const { formId, courseId } = await params;
  const [form, course] = await Promise.all([
    db.feedbackForm.findUnique({ where: { id: formId } }),
    db.course.findUnique({ where: { id: courseId }, include: { faculty: true } }),
  ]);
  if (!form || !course) notFound();
  const responses = await db.feedbackResponse.findMany({ where: { formId, courseId } });
  const summary = summarise(responses, questionsOf(form));
  if (user.role === "FACULTY") {
    const vis = facultyVisibility(form, summary.n);
    if (course.facultyId !== user.id || !vis.visible) {
      await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "FeedbackForm", entityId: formId, summary: `Blocked access to ${course.code} feedback (${course.facultyId !== user.id ? "not the course teacher" : "not yet released"})` });
      redirect(`/forbidden?path=${encodeURIComponent(`/feedback/${formId}/courses/${courseId}`)}`);
    }
  }
  const [enrolled, actions] = await Promise.all([
    db.enrolment.count({ where: { courseId, academicYear: form.academicYear, status: "ACTIVE" } }),
    db.feedbackAction.findMany({ where: { formId, courseId }, orderBy: { createdAt: "asc" } }),
  ]);
  const authors = await db.user.findMany({ where: { id: { in: actions.map((a) => a.createdById) } } });
  const band = bandFor(summary.index);
  const canAct = ["IQAC", "HOD", "ADMIN"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="text-sm"><Link href={user.role === "FACULTY" ? "/feedback" : `/feedback/${formId}`} className="text-brand-700 hover:underline">← {user.role === "FACULTY" ? "My course feedback" : form.title}</Link></div>
      <PageHeader eyebrow={form.title} title={`${course.code} ${course.title}`} description={`Teacher: ${course.faculty?.name ?? "—"} · anonymous responses`} actions={<Badge tone={band.tone}>{band.label}</Badge>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Responses" value={`${summary.n}/${enrolled}`} hint={`${enrolled ? Math.round((summary.n / enrolled) * 100) : 0}% response rate`} tone="brand" />
        <Stat label="Course index" value={summary.index ?? "—"} hint="mean of rating questions, out of 5" tone={band.tone === "red" || band.tone === "amber" ? "amber" : "green"} />
        <Stat label="Comments" value={summary.comments.length} />
      </div>
      {summary.n < form.minResponses && <Callout tone="amber" title="Too few responses">Fewer than {form.minResponses} students responded; this report is not shown to the teacher.</Callout>}
      <QuestionBreakdown summary={summary} title="Question-wise results" />
      <Comments summary={summary} />
      <Card>
        <CardHeader title="Action taken" description="Recorded by the IQAC or the Dean; included in the NAAC 1.4 export" />
        <div className="space-y-3 px-5 py-4">
          {actions.map((a) => (
            <div key={a.id} className="rounded-lg border border-border px-4 py-3 text-sm">
              {a.note}
              <div className="mt-1 text-xs text-muted-foreground">{authors.find((u) => u.id === a.createdById)?.name} · {formatDate(a.createdAt, true)}</div>
            </div>
          ))}
          {actions.length === 0 && <p className="text-sm text-muted-foreground">No action recorded yet.</p>}
          {canAct && <ActionTakenForm formId={formId} courseId={courseId} />}
        </div>
      </Card>
    </div>
  );
}
