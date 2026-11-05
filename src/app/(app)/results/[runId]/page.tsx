import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Download, FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { flagsOf } from "@/lib/results/workflow";
import type { ComponentResult } from "@/lib/results/engine";
import { Badge, Callout, Card, CardHeader, PageHeader, Stat, buttonVariants, type BadgeTone } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { ApproveButton, PublishButton } from "../results-client";

export const maxDuration = 300;

const GRADE_TONE: Record<string, BadgeTone> = { O: "green", "A+": "green", A: "green", "B+": "blue", B: "blue", C: "amber", F: "red", AB: "red", NA: "red", W: "violet" };
const FLAG_TONE: Record<string, BadgeTone> = {
  GRACE: "amber", COMPONENT_FAIL: "red", AGGREGATE_PASS_COMPONENT_FAIL: "red", AGGREGATE_FAIL: "red", ABSENT: "red",
  NOT_ALLOWED: "red", EVALUATION_PENDING: "violet", MARKS_MISSING: "violet", NOT_REGISTERED: "red", GRACE_NOT_APPLICABLE: "neutral",
};

export default async function RunPage({ params, searchParams }: PageProps<"/results/[runId]">) {
  const user = await requirePage("/results");
  const { runId } = await params;
  const sp = await searchParams;
  const run = await db.resultRun.findUnique({
    where: { id: runId },
    include: {
      exam: true,
      semResults: { include: { student: { include: { batch: true } } }, orderBy: { student: { rollNo: "asc" } } },
      courseResults: { include: { enrolment: { include: { course: true } } } },
    },
  });
  if (!run) notFound();
  const people = await db.user.findMany({ where: { id: { in: [run.processedById, run.approvedById ?? "", run.publishedById ?? ""] } } });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const summary = run.summary as { students: number; pass: number; fail: number; withheld: number; graceCount: number; componentFail: number; notAllowed: number; absent: number; grades: Record<string, number> };
  const rules = run.rulesUsed as { grading: { key: string; version: number }; grace: { key: string; version: number } | null };

  const batches = Array.from(new Map(run.semResults.map((s) => [s.student.batch.code, s.student.batch])).values()).sort((a, b) => a.code.localeCompare(b.code));
  const batch = String(sp.batch ?? batches[0]?.code ?? "");
  const onlyFlagged = sp.flagged === "1";
  const rows = run.semResults
    .filter((s) => s.student.batch.code === batch)
    .filter((s) => !onlyFlagged || run.courseResults.some((c) => c.studentId === s.studentId && flagsOf(c.flags).length));
  const gradeOrder = ["O", "A+", "A", "B+", "B", "C", "F", "AB", "NA", "W"];
  const maxGrade = Math.max(1, ...Object.values(summary.grades));

  const steps = [
    { label: "Processed", by: name(run.processedById), at: run.processedAt, done: true },
    { label: "Verified & approved", by: name(run.approvedById), at: run.approvedAt, done: !!run.approvedAt },
    { label: "Published", by: name(run.publishedById), at: run.publishedAt, done: !!run.publishedAt },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Result run · ${run.status}`}
        title={run.exam.name}
        description={`Rules applied: ${rules.grading.key} v${rules.grading.version}${rules.grace ? `, ${rules.grace.key} v${rules.grace.version}` : ""} · component minimums from evaluation schemes`}
        actions={
          <>
            <a href={`/results/${run.id}/excel`} className={buttonVariants({ variant: "outline" })}>
              <FileSpreadsheet className="h-4 w-4" /> Verification workbook (Excel)
            </a>
            <a href={`/results/${run.id}/export`} className={buttonVariants({ variant: "ghost" })}>
              <Download className="h-4 w-4" /> CSV
            </a>
            {run.status === "PROCESSED" && user.role === "COE" && <ApproveButton runId={run.id} />}
            {run.status === "APPROVED" && user.role === "VC" && <PublishButton runId={run.id} />}
          </>
        }
      />

      <Card className="p-4">
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.label} className={cn("flex items-start gap-3 rounded-lg border p-3", s.done ? "border-leaf-100 bg-leaf-50" : "border-border")}>
              <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-leaf-600 text-white" : "bg-muted text-muted-foreground")}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <div className="text-sm">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.done ? `${s.by} · ${formatDate(s.at!, true)}` : i === 1 ? "Controller of Examinations (must differ from processor)" : "Vice-Chancellor"}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      {run.status === "PROCESSED" && user.id === run.processedById && (
        <Callout tone="amber">You processed this run. Approval must be given by a different authorised officer.</Callout>
      )}
      {summary.withheld > 0 && (
        <Callout tone="amber" title={`${summary.withheld} student result(s) withheld`}>
          Pending evaluations are marked W. Complete them and re-process to release these results.
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Students" value={summary.students} tone="brand" />
        <Stat label="Passed" value={summary.pass} tone="green" />
        <Stat label="With backlog" value={summary.fail} tone="red" />
        <Stat label="Withheld" value={summary.withheld} tone={summary.withheld ? "amber" : "neutral"} />
        <Stat label="Grace applied" value={summary.graceCount} tone="amber" hint="within configured limits" />
        <Stat label="Component failures" value={summary.componentFail} tone="red" hint="aggregate ≠ pass" />
      </div>

      <Card>
        <CardHeader title="Grade distribution" description="All course results in this run" />
        <div className="flex items-end gap-3 px-5 pb-4 pt-6">
          {gradeOrder.filter((g) => summary.grades[g]).map((g) => (
            <div key={g} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium">{summary.grades[g]}</span>
              <div className={cn("w-full rounded-t", ["F", "AB", "NA"].includes(g) ? "bg-red-400" : g === "W" ? "bg-violet-400" : "bg-brand-400")} style={{ height: `${(summary.grades[g] / maxGrade) * 120}px` }} />
              <span className="text-xs font-semibold">{g}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {batches.map((b) => (
          <Link key={b.id} href={`/results/${run.id}?batch=${b.code}${onlyFlagged ? "&flagged=1" : ""}`} className={cn("rounded-full border px-3 py-1.5 text-sm", b.code === batch ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-white hover:bg-muted")}>
            {b.name}
          </Link>
        ))}
        <Link href={`/results/${run.id}?batch=${batch}${onlyFlagged ? "" : "&flagged=1"}`} className={cn("ml-auto rounded-full border px-3 py-1.5 text-sm", onlyFlagged ? "border-amber-500 bg-amber-50 text-amber-900" : "border-border bg-white")}>
          {onlyFlagged ? "Showing flagged only" : "Show flagged only"}
        </Link>
      </div>

      <Card>
        <div className="divide-y divide-border">
          {rows.map((s) => {
            const courses = run.courseResults.filter((c) => c.studentId === s.studentId).sort((a, b) => a.enrolment.course.code.localeCompare(b.enrolment.course.code));
            const flagged = courses.some((c) => flagsOf(c.flags).length);
            return (
              <details key={s.id} className="group">
                <summary className={cn("flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 hover:bg-muted/30", flagged && "bg-amber-50/30")}>
                  <div className="w-52">
                    <div className="font-medium">{s.student.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{s.student.rollNo}</div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1">
                    {courses.map((c) => (
                      <span key={c.id} title={c.enrolment.course.title} className="inline-flex items-center gap-1 rounded border border-border bg-white px-1.5 py-0.5 text-xs">
                        <span className="font-mono text-muted-foreground">{c.enrolment.course.code}</span>
                        <Badge tone={GRADE_TONE[c.grade] ?? "neutral"}>{c.grade}</Badge>
                        {c.grace > 0 && <span className="text-amber-700">+{c.grace}g</span>}
                      </span>
                    ))}
                  </div>
                  <div className="w-20 text-right">
                    <div className="text-xs text-muted-foreground">SGPA</div>
                    <div className="font-semibold">{s.sgpa.toFixed(2)}</div>
                  </div>
                  <div className="w-20 text-right">
                    <div className="text-xs text-muted-foreground">CGPA</div>
                    <div className="font-semibold">{s.cgpa.toFixed(2)}</div>
                  </div>
                  <div className="w-28 text-right">
                    <Badge tone={s.result === "PASS" ? "green" : s.result === "WITHHELD" ? "violet" : "red"}>{s.result}</Badge>
                  </div>
                </summary>
                <div className="overflow-x-auto bg-muted/20 px-5 pb-4 pt-1">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3">Course</th>
                        <th className="pr-3">Components (marks / max · minimum)</th>
                        <th className="pr-3 text-right">Raw</th>
                        <th className="pr-3 text-right">Grace</th>
                        <th className="pr-3 text-right">Total</th>
                        <th className="pr-3">Grade</th>
                        <th>Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c) => (
                        <tr key={c.id} className="border-t border-border align-top">
                          <td className="py-2 pr-3">
                            <div className="font-mono">{c.enrolment.course.code}</div>
                            <div className="max-w-48 text-muted-foreground">{c.enrolment.course.title}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {(c.components as unknown as ComponentResult[]).map((x) => (
                                <span key={x.code} className={cn("rounded px-1.5 py-0.5 ring-1 ring-inset", x.ok ? "bg-white ring-border" : "bg-red-50 text-red-800 ring-red-200")}>
                                  {x.code} {x.marks ?? "—"}/{x.max}{x.pass != null && <span className="text-muted-foreground"> ·min {x.pass}</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right">{c.rawTotal}</td>
                          <td className="py-2 pr-3 text-right">{c.grace || "—"}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{c.total}</td>
                          <td className="py-2 pr-3"><Badge tone={GRADE_TONE[c.grade] ?? "neutral"}>{c.grade}</Badge> <span className="text-muted-foreground">{c.gradePoint} pts · {c.credits} cr</span></td>
                          <td className="py-2">
                            <div className="flex flex-col gap-1">
                              {flagsOf(c.flags).map((f, i) => (
                                <span key={i} className="flex items-start gap-1">
                                  <Badge tone={FLAG_TONE[f.code] ?? "neutral"}>{f.code.replaceAll("_", " ")}</Badge>
                                  <span className="text-muted-foreground">{f.detail}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Credits {s.earnedCredits}/{s.credits} earned · SGPA = Σ(credits × grade points) / Σ credits = {s.sgpa.toFixed(2)} · CGPA {s.cgpa.toFixed(2)}{s.division ? ` · ${s.division}` : ""}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
