import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { isOpen, questionsOf } from "@/lib/feedback/feedback";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import { FeedbackQuestionnaire } from "./questionnaire";

export default async function GiveFeedbackPage({ params, searchParams }: PageProps<"/me/feedback/[formId]">) {
  const user = await requirePage("/me/feedback");
  if (!user.studentId) return <EmptyState title="No student record linked" />;
  const { formId } = await params;
  const courseId = String((await searchParams).course ?? "");
  const form = await db.feedbackForm.findUnique({ where: { id: formId } });
  if (!form) notFound();
  const course = courseId ? await db.course.findUnique({ where: { id: courseId }, include: { faculty: true } }) : null;
  const done = await db.feedbackSubmission.findUnique({ where: { formId_studentId_courseId: { formId, studentId: user.studentId, courseId: form.type === "COURSE" ? courseId : "" } } });

  return (
    <div className="space-y-6">
      <div className="text-sm"><Link href="/me/feedback" className="text-brand-700 hover:underline">← Feedback</Link></div>
      <PageHeader
        eyebrow={form.title}
        title={course ? `${course.code} ${course.title}` : form.title}
        description={course ? `Teacher: ${course.faculty?.name ?? "—"} · rate each statement from 1 (strongly disagree) to 5 (strongly agree)` : "Rate each statement from 1 (strongly disagree) to 5 (strongly agree)"}
      />
      {!isOpen(form) ? (
        <Callout tone="amber" title="This form is closed">The feedback window has closed.</Callout>
      ) : done ? (
        <Callout tone="green" title="Already submitted">Thank you — you have already given this feedback.</Callout>
      ) : (
        <FeedbackQuestionnaire formId={form.id} courseId={course?.id ?? ""} questions={questionsOf(form)} />
      )}
    </div>
  );
}
