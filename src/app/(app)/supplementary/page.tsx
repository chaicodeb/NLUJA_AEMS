import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { getActiveRule } from "@/lib/rules/store";
import { currentSupplementary, type SupplementaryParams } from "@/lib/results/supplementary";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CreateSupplementaryButton, ProcessSupplementaryButton } from "./client";

export default async function SupplementaryPage() {
  const user = await requirePage("/supplementary");
  const [exam, rule, regular] = await Promise.all([
    currentSupplementary(),
    getActiveRule("SUPPLEMENTARY"),
    db.resultRun.findFirst({ where: { status: "PUBLISHED", exam: { type: "REGULAR", code: { not: "LEGACY-MIGRATION" } } }, orderBy: { publishedAt: "desc" }, include: { exam: true } }),
  ]);
  const p = rule?.params as unknown as SupplementaryParams | undefined;
  const backlogs = regular ? await db.courseResult.groupBy({ by: ["status"], where: { runId: regular.id, status: { in: ["FAIL", "AB", "NA"] } }, _count: { _all: true } }) : [];
  const count = (s: string) => backlogs.find((b) => b.status === s)?._count._all ?? 0;

  const header = (
    <PageHeader
      eyebrow="Backlog & improvement"
      title="Supplementary examinations"
      description="Students clear failed or absent papers, or improve a low passing grade, without repeating the course. Internal assessment is carried forward; only the end-semester component is re-taken. Students barred for attendance shortage must repeat the course instead."
    />
  );
  const ruleNote = p && rule && (
    <Callout tone="blue" title={`Active rule ${rule.key} v${rule.version}`}>
      ₹{p.feePerPaper} per paper · improvement for grades {p.improvementMaxGrade} and below (at most {p.maxImprovementPapers}, better of the two attempts kept) · backlog grade cap: {p.backlogGradeCap ?? "none"} · <Link href={`/rules/${rule.key}`} className="underline">edit rule</Link>
    </Callout>
  );

  if (!exam) {
    return (
      <div className="space-y-6">
        {header}
        {ruleNote}
        {regular ? (
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm">
                <div className="font-medium">{regular.exam.name} — results published {formatDate(regular.publishedAt!, true)}</div>
                <div className="text-muted-foreground">{count("FAIL")} failed and {count("AB")} absent course result(s) can be cleared; {count("NA")} attendance-shortage case(s) must repeat the course.</div>
              </div>
              {user.role === "COE" && <CreateSupplementaryButton />}
            </div>
          </Card>
        ) : (
          <EmptyState title="Nothing to schedule yet" description="A supplementary examination can be created once the regular examination's results are published." />
        )}
      </div>
    );
  }

  const regs = await db.examRegistration.findMany({
    where: { examId: exam.id },
    include: { student: { include: { batch: true } }, papers: { include: { examPaper: { include: { course: true } }, supMark: true } } },
    orderBy: { submittedAt: "asc" },
  });
  const allPapers = regs.flatMap((r) => r.papers);
  const papers = exam.papers
    .map((pp) => {
      const rp = allPapers.filter((x) => x.examPaperId === pp.id);
      return { pp, backlog: rp.filter((x) => x.kind === "BACKLOG").length, improvement: rp.filter((x) => x.kind === "IMPROVEMENT").length, submitted: rp.length > 0 && rp.every((x) => x.supMark?.status === "SUBMITTED"), total: rp.length };
    })
    .filter((x) => x.total > 0);
  const run = await db.resultRun.findFirst({ where: { examId: exam.id, status: { not: "WITHDRAWN" } }, orderBy: { processedAt: "desc" } });
  const ready = papers.length > 0 && papers.every((x) => x.submitted);

  return (
    <div className="space-y-6">
      {header}
      {ruleNote}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-semibold">{exam.name}</div>
            <div className="text-sm text-muted-foreground">{exam.code} · {formatDate(exam.startDate)} – {formatDate(exam.endDate)} · {exam.papers.length} papers scheduled</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={exam.registrationOpen ? "green" : "neutral"}>{exam.registrationOpen ? "Registration open" : "Registration closed"}</Badge>
            <Badge tone="brand">{exam.status.replace("_", " ")}</Badge>
            {run ? (
              <Link href={`/results/${run.id}`} className={buttonVariants({ size: "sm" })}>Result run · {run.status.toLowerCase()}</Link>
            ) : (
              ["EXAM_STAFF", "COE", "ADMIN"].includes(user.role) && <ProcessSupplementaryButton examId={exam.id} disabled={!ready} />
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Candidates" value={regs.length} tone="brand" />
        <Stat label="Backlog papers" value={allPapers.filter((x) => x.kind === "BACKLOG").length} tone="amber" />
        <Stat label="Improvement papers" value={allPapers.filter((x) => x.kind === "IMPROVEMENT").length} />
        <Stat label="Award lists submitted" value={`${papers.filter((x) => x.submitted).length}/${papers.length}`} tone={ready ? "green" : "neutral"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Papers with candidates" description="The Examination Branch enters each paper's award list once scripts are evaluated" />
          {papers.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">No registrations yet.</div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Paper</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Backlog</TH>
                  <TH className="text-right">Improvement</TH>
                  <TH>Award list</TH>
                </tr>
              </THead>
              <tbody>
                {papers.map(({ pp, backlog, improvement, submitted }) => (
                  <TR key={pp.id}>
                    <TD><span className="font-mono text-xs text-muted-foreground">{pp.course.code}</span> <span className="text-sm">{pp.course.title}</span></TD>
                    <TD className="text-xs">{formatDate(pp.date)}</TD>
                    <TD className="text-right">{backlog}</TD>
                    <TD className="text-right">{improvement}</TD>
                    <TD>
                      <Link href={`/supplementary/papers/${pp.id}`} className="text-sm text-brand-700 hover:underline">
                        {submitted ? <Badge tone="green">Submitted</Badge> : "Enter marks"}
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Registered candidates" description="Students register and pay online from their portal" />
          <ul className="divide-y divide-border">
            {regs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{r.student.name} <span className="font-mono text-xs text-muted-foreground">{r.student.rollNo}</span></div>
                  <div className="text-xs text-muted-foreground">{r.paymentRef} · {formatDate(r.submittedAt, true)}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.papers.map((x) => (
                    <Badge key={x.id} tone={x.kind === "BACKLOG" ? "amber" : "blue"}>{x.examPaper.course.code} · {x.kind === "BACKLOG" ? "backlog" : "improvement"}</Badge>
                  ))}
                </div>
              </li>
            ))}
            {regs.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No candidates yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
