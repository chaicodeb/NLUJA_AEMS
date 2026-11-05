import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { MANAGER_ROLES, facultyVisibility, formAnalytics } from "@/lib/feedback/feedback";
import { bandFor } from "@/lib/feedback/shared";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { FormControls, NewFormButton } from "./client";

const STATUS = { DRAFT: { label: "Draft", tone: "neutral" }, OPEN: { label: "Open", tone: "green" }, CLOSED: { label: "Closed", tone: "blue" } } as const;

export default async function FeedbackPage() {
  const user = await requirePage("/feedback");
  const forms = await db.feedbackForm.findMany({ orderBy: [{ status: "desc" }, { opensAt: "desc" }] });
  if (user.role === "FACULTY") return <TeacherView userId={user.id} forms={forms.filter((f) => f.type === "COURSE" && f.status !== "DRAFT")} />;
  const manager = MANAGER_ROLES.includes(user.role);
  const analytics = await Promise.all(forms.map((f) => formAnalytics(f.id)));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance · NAAC criterion 1.4"
        title="Feedback & surveys"
        description="Anonymous course-and-teacher feedback and the student satisfaction survey, analysed course by course, with action-taken reporting for IQAC and NAAC."
        actions={manager && <NewFormButton academicYear="2026-27" />}
      />
      {forms.length === 0 && <EmptyState title="No feedback forms yet" />}
      <div className="grid gap-4 lg:grid-cols-2">
        {analytics.map(({ form, overall, eligible, courses }) => {
          const band = bandFor(overall.index);
          const low = courses.filter((c) => c.summary.n >= form.minResponses && (c.summary.index ?? 5) < 3.6);
          return (
            <Card key={form.id} className="flex flex-col">
              <CardHeader
                title={form.title}
                description={`${form.type === "COURSE" ? "Course & teacher feedback" : form.type === "EXIT" ? "Graduate exit survey" : "Institution-wide survey"} · ${formatDate(form.opensAt)} – ${formatDate(form.closesAt)}`}
                action={<Badge tone={STATUS[form.status as keyof typeof STATUS].tone}>{STATUS[form.status as keyof typeof STATUS].label}{form.releasedToFaculty ? " · released" : ""}</Badge>}
              />
              <div className="grid grid-cols-3 gap-3 px-5 py-4 text-center">
                <div className="rounded-lg bg-muted/50 py-2">
                  <div className="text-[11px] text-muted-foreground">Responses</div>
                  <div className="text-lg font-semibold">{overall.n}<span className="text-xs font-normal text-muted-foreground">/{eligible}</span></div>
                </div>
                <div className="rounded-lg bg-muted/50 py-2">
                  <div className="text-[11px] text-muted-foreground">Response rate</div>
                  <div className="text-lg font-semibold">{eligible ? Math.round((overall.n / eligible) * 100) : 0}%</div>
                </div>
                <div className="rounded-lg bg-muted/50 py-2">
                  <div className="text-[11px] text-muted-foreground">Overall index</div>
                  <div className="text-lg font-semibold">{overall.index ?? "—"}<span className="text-xs font-normal text-muted-foreground">/5</span></div>
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-end justify-between gap-2 px-5 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={band.tone}>{band.label}</Badge>
                  {low.length > 0 && <Badge tone="amber">{low.length} course(s) below 3.6</Badge>}
                </div>
                <div className="flex gap-2">
                  {manager && <FormControls formId={form.id} status={form.status} released={form.releasedToFaculty} />}
                  <Link href={`/feedback/${form.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>{form.status === "DRAFT" ? "Edit" : "Analysis"}</Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

async function TeacherView({ userId, forms }: { userId: string; forms: { id: string; title: string; status: string; releasedToFaculty: boolean; minResponses: number; closesAt: Date }[] }) {
  const reports = await Promise.all(forms.map((f) => formAnalytics(f.id, userId)));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Teaching" title="My course feedback" description="Anonymous student feedback on your courses. Results appear once the window closes and the IQAC releases them; courses with too few responses stay hidden to protect anonymity." />
      {reports.length === 0 && <EmptyState title="No feedback yet" />}
      {reports.map(({ form, courses }) => (
        <Card key={form.id}>
          <CardHeader title={form.title} description={form.status === "OPEN" ? `Open until ${formatDate(form.closesAt)}` : "Closed"} />
          <Table>
            <THead>
              <tr>
                <TH>Course</TH>
                <TH className="text-right">Responses</TH>
                <TH>Result</TH>
              </tr>
            </THead>
            <tbody>
              {courses.map((c) => {
                const vis = facultyVisibility(form, c.summary.n);
                const band = bandFor(c.summary.index);
                return (
                  <TR key={c.id}>
                    <TD><span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.title}</TD>
                    <TD className="text-right">{c.summary.n}/{c.enrolled}</TD>
                    <TD>
                      {vis.visible ? (
                        <Link href={`/feedback/${form.id}/courses/${c.id}`} className="inline-flex items-center gap-2 text-sm text-brand-700 hover:underline">
                          <Badge tone={band.tone}>{c.summary.index} · {band.label}</Badge> View report
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">{vis.reason}</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ))}
      <Callout tone="blue">Feedback is advisory and is reviewed with you by the Dean; it is never shown alongside students&apos; names.</Callout>
    </div>
  );
}
