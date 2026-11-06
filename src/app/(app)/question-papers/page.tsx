import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { requirePage } from "@/lib/session";
import { blocking } from "@/lib/exams/question-paper-checks";
import { QP_LABEL, QP_TONE, checksFor, decryptContent, listPapers, rightsNow, type QPStatus } from "@/lib/exams/question-paper";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { StartButton } from "./start-button";

export default async function QuestionPapersPage() {
  const user = await requirePage("/question-papers");
  const papers = await listPapers(user);
  if (!papers.length) return <EmptyState title="No question papers to set" description="Papers appear here once an examination's date sheet is published and you are named as a paper setter." />;

  const rows = papers.map((p) => {
    const rights = rightsNow(user, p);
    const checks = rights.viewContent && p.questionPaper ? checksFor(p, decryptContent(p.questionPaper.body)) : null;
    return { p, rights, checks };
  });
  const count = (s: QPStatus | "NOT_STARTED") => rows.filter((r) => r.rights.status === s).length;
  const exams = [...new Map(papers.map((p) => [p.examId, p.exam])).values()];
  const intro =
    user.role === "FACULTY" ? "Papers you have been appointed to set. Draft each paper here, run the automatic checks and preview it exactly as candidates will see it — nothing reaches students until it is handed out in the examination hall."
      : user.role === "HOD" ? "Papers submitted by setters for moderation. Review the paper and its automatic checks, then approve it or return it with comments."
        : user.role === "EXAM_STAFF" ? "Status of every question paper. Contents stay sealed from the Examination Branch until they are released for printing on the day of the paper."
          : "Setting, moderation, sealing and release of every question paper. Contents are encrypted at rest; every view, preview and print is recorded in the audit trail.";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Examinations" title="Question papers" description={intro} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Not started" value={count("NOT_STARTED")} />
        <Stat label="Drafting" value={count("DRAFT") + count("CHANGES_REQUESTED")} hint={count("CHANGES_REQUESTED") ? `${count("CHANGES_REQUESTED")} returned by moderator` : undefined} tone={count("CHANGES_REQUESTED") ? "red" : "neutral"} />
        <Stat label="Awaiting moderation" value={count("SUBMITTED")} tone={count("SUBMITTED") ? "amber" : "neutral"} />
        <Stat label="Moderated" value={count("APPROVED")} />
        <Stat label="Sealed" value={count("SEALED")} tone="brand" />
        <Stat label="Released" value={count("RELEASED")} tone="green" />
      </div>
      <Callout tone="blue" title="Who can see a question paper">
        <span className="inline-flex items-start gap-1.5"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Only the paper&apos;s setter, the moderator (Head of Department) and the Controller of Examinations can open its contents. The Examination Branch sees status only until the paper is released, one hour before it starts. Students and evaluators never see it in the system.</span>
      </Callout>
      {exams.map((exam) => (
        <Card key={exam.id}>
          <CardHeader title={exam.name} description={`${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`} />
          <Table>
            <THead>
              <tr>
                <TH>Paper</TH>
                <TH>Date</TH>
                <TH>Setter</TH>
                <TH>Moderator</TH>
                <TH>Status</TH>
                <TH>Checks</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {rows.filter((r) => r.p.examId === exam.id).map(({ p, rights, checks }) => {
                const fails = checks ? blocking(checks).length : 0;
                const warns = checks ? checks.filter((c) => c.level === "warn").length : 0;
                return (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-medium">{p.course.code}</div>
                      <div className="text-xs text-muted-foreground">{p.course.title}</div>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{formatDate(p.date)} · {p.session}</TD>
                    <TD className="text-xs">{p.setter?.name ?? "—"}</TD>
                    <TD className="text-xs">{p.questionPaper?.moderatorName ?? "—"}</TD>
                    <TD>
                      <Badge tone={QP_TONE[rights.status]}>{QP_LABEL[rights.status]}</Badge>
                      {p.questionPaper && p.questionPaper.version > 1 && <span className="ml-1 text-xs text-muted-foreground">v{p.questionPaper.version}</span>}
                    </TD>
                    <TD className="text-xs">
                      {checks ? (
                        fails ? <span className="font-medium text-red-700">{fails} failing</span> : <span className="text-leaf-700">All pass{warns ? ` · ${warns} to review` : ""}</span>
                      ) : p.questionPaper ? (
                        <span className="text-muted-foreground">Sealed from you</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {rights.start ? (
                        <StartButton id={p.id} />
                      ) : p.questionPaper ? (
                        <Link href={`/question-papers/${p.id}`} className={buttonVariants({ size: "sm", variant: rights.edit || rights.moderate || rights.seal || rights.release ? "default" : "outline" })}>
                          {rights.edit ? "Edit" : rights.moderate ? "Moderate" : rights.seal ? "Seal" : rights.release ? "Release" : "Open"}
                        </Link>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
