import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { requirePage } from "@/lib/session";
import { studentFeedback } from "@/lib/feedback/feedback";
import { getT } from "@/lib/i18n/server";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function MyFeedbackPage() {
  const user = await requirePage("/me/feedback");
  const t = await getT();
  if (!user.studentId) return <EmptyState title={t("No student record linked")} />;
  const { items } = await studentFeedback(user.studentId);
  const forms = [...new Set(items.map((i) => i.formId))];
  const pending = items.filter((i) => !i.done).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Student portal")} title={t("Feedback")} description={t("Tell the University how your courses and campus services are working. Takes about two minutes per course.")} />
      <Callout tone="blue" title={t("Your feedback is anonymous")}>
        {t("The system records only that you responded, so it can stop reminding you — your answers are stored separately with no link to your name or roll number. Teachers see consolidated results only after the window closes, and only where at least five students responded.")}
      </Callout>
      {forms.length === 0 ? (
        <EmptyState title={t("No feedback forms are open")} description={t("You will be notified when the next feedback window opens.")} />
      ) : (
        forms.map((formId) => {
          const list = items.filter((i) => i.formId === formId);
          return (
            <Card key={formId}>
              <CardHeader
                title={list[0].formTitle}
                description={t("Open until {date} · {done}/{total} done", { date: formatDate(list[0].closesAt), done: list.filter((i) => i.done).length, total: list.length })}
                action={<Badge tone={list.every((i) => i.done) ? "green" : "amber"}>{list.every((i) => i.done) ? t("Complete") : t("{n} pending", { n: list.filter((i) => !i.done).length })}</Badge>}
              />
              <ul className="divide-y divide-border">
                {list.map((i) => (
                  <li key={i.courseId || i.formId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      {i.code ? <><span className="font-mono text-xs text-muted-foreground">{i.code}</span> {i.title}</> : <span className="font-medium">{i.formTitle.toLowerCase().includes("exit") ? t("Graduate exit survey") : t("Institution-wide survey")}</span>}
                      {i.teacher && <div className="text-xs text-muted-foreground">{i.teacher}</div>}
                    </div>
                    {i.done ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-leaf-700"><CheckCircle2 className="h-4 w-4" /> {t("Submitted")}</span>
                    ) : (
                      <Link href={`/me/feedback/${i.formId}${i.courseId ? `?course=${i.courseId}` : ""}`} className={buttonVariants({ size: "sm" })}>{t("Give feedback")}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
      {pending === 0 && forms.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> {t("Thank you — all feedback for this window is complete.")}</p>
      )}
    </div>
  );
}
