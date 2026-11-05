import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { requirePage } from "@/lib/session";
import { studentFeedback } from "@/lib/feedback/feedback";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function MyFeedbackPage() {
  const user = await requirePage("/me/feedback");
  if (!user.studentId) return <EmptyState title="No student record linked" />;
  const { items } = await studentFeedback(user.studentId);
  const forms = [...new Set(items.map((i) => i.formId))];
  const pending = items.filter((i) => !i.done).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Student portal" title="Feedback" description="Tell the University how your courses and campus services are working. Takes about two minutes per course." />
      <Callout tone="blue" title="Your feedback is anonymous">
        The system records only <em>that</em> you responded, so it can stop reminding you — your answers are stored separately with no link to your name or roll number. Teachers see consolidated results only after the window closes, and only where at least five students responded.
      </Callout>
      {forms.length === 0 ? (
        <EmptyState title="No feedback forms are open" description="You will be notified when the next feedback window opens." />
      ) : (
        forms.map((formId) => {
          const list = items.filter((i) => i.formId === formId);
          return (
            <Card key={formId}>
              <CardHeader
                title={list[0].formTitle}
                description={`Open until ${formatDate(list[0].closesAt)} · ${list.filter((i) => i.done).length}/${list.length} done`}
                action={<Badge tone={list.every((i) => i.done) ? "green" : "amber"}>{list.every((i) => i.done) ? "Complete" : `${list.filter((i) => !i.done).length} pending`}</Badge>}
              />
              <ul className="divide-y divide-border">
                {list.map((i) => (
                  <li key={i.courseId || i.formId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      {i.code ? <><span className="font-mono text-xs text-muted-foreground">{i.code}</span> {i.title}</> : <span className="font-medium">{i.formTitle.toLowerCase().includes("exit") ? "Graduate exit survey" : "Institution-wide survey"}</span>}
                      {i.teacher && <div className="text-xs text-muted-foreground">{i.teacher}</div>}
                    </div>
                    {i.done ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-leaf-700"><CheckCircle2 className="h-4 w-4" /> Submitted</span>
                    ) : (
                      <Link href={`/me/feedback/${i.formId}${i.courseId ? `?course=${i.courseId}` : ""}`} className={buttonVariants({ size: "sm" })}>Give feedback</Link>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
      {pending === 0 && forms.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> Thank you — all feedback for this window is complete.</p>
      )}
    </div>
  );
}
