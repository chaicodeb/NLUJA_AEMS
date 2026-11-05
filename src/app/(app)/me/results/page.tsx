import { Download, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import type { GradeSheetPayload } from "@/lib/results/workflow";
import type { TranscriptPayload } from "@/lib/results/transcript";
import { StudentCopyButton } from "../../transcripts/transcript-buttons";
import { revaluationOptions } from "@/lib/results/revaluation";
import { publishedSemesters } from "@/lib/results/engine";
import { ApplyForm } from "../../revaluations/client";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants, type BadgeTone } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const GRADE_TONE: Record<string, BadgeTone> = { O: "green", "A+": "green", A: "green", "B+": "blue", B: "blue", C: "amber", F: "red", AB: "red", NA: "red", W: "violet" };

export default async function MyResultsPage() {
  const user = await requirePage("/me/results");
  const studentId = user.studentId ?? user.wardId;
  if (!studentId) return <EmptyState title="No student record linked" />;
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: true } });
  const sheets = await db.document.findMany({ where: { studentId, type: "GRADE_SHEET", revoked: false }, orderBy: { issuedAt: "desc" } });
  const history = await publishedSemesters(studentId);
  const reval = await revaluationOptions(studentId);
  const transcripts = await db.document.findMany({ where: { studentId, type: "TRANSCRIPT", revoked: false }, orderBy: { issuedAt: "desc" }, take: 10 });
  const latest = sheets[0];
  const p = latest?.payload as GradeSheetPayload | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.role === "PARENT" ? "Parent portal · read-only" : "Student portal"}
        title="Results & grade sheets"
        description={`${student.name} · ${student.rollNo} · ${student.batch.name}`}
        actions={
          latest && (
            <a href={`/api/grade-sheet/${latest.id}`} target="_blank" className={buttonVariants({ variant: "success" })}>
              <Download className="h-4 w-4" /> Download grade sheet
            </a>
          )
        }
      />
      {!p ? (
        <Callout tone="amber" title="Results not yet published">
          Results for the current semester will appear here as soon as the University publishes them. You will also receive an SMS and e-mail.
        </Callout>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={`SGPA · Semester ${p.semester}`} value={p.sgpa.toFixed(2)} tone="brand" />
            <Stat label="CGPA" value={p.cgpa.toFixed(2)} tone="green" hint={p.division ?? undefined} />
            <Stat label="Credits earned" value={`${p.earnedCredits}/${p.credits}`} />
            <Stat label="Result" value={<Badge tone={p.result === "PASS" ? "green" : "red"}>{p.result === "PASS" ? "PASS" : "BACKLOG"}</Badge>} />
          </div>
          <Card>
            <CardHeader
              title={`Semester ${p.semester} grade sheet`}
              description={`${p.exam.name} · published ${formatDate(p.publishedOn, true)}`}
              action={
                <a href={`/verify/${latest.verifyCode}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  <ShieldCheck className="h-4 w-4" /> Verify ({latest.verifyCode})
                </a>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Course</TH>
                  <TH className="text-right">Credits</TH>
                  <TH className="text-right">Marks</TH>
                  <TH>Grade</TH>
                  <TH className="text-right">Grade points</TH>
                </tr>
              </THead>
              <tbody>
                {p.courses.map((c) => (
                  <TR key={c.code}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD>{c.title}</TD>
                    <TD className="text-right">{c.credits}</TD>
                    <TD className="text-right">{["PASS", "FAIL"].includes(c.status) ? `${c.total}/${c.max}` : "—"}</TD>
                    <TD><Badge tone={GRADE_TONE[c.grade] ?? "neutral"}>{c.grade}</Badge></TD>
                    <TD className="text-right">{c.gradePoint}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
      {reval && reval.papers.length > 0 && (
        <Card>
          <CardHeader
            title="Revaluation & scrutiny"
            description={reval.open ? `Apply by ${formatDate(reval.deadline)} · revaluation ₹${reval.params.feeRevaluation}, scrutiny ₹${reval.params.feeScrutiny} per paper · up to ${reval.params.maxPapers} papers` : `The application window closed on ${formatDate(reval.deadline)}`}
          />
          <Table>
            <THead>
              <tr>
                <TH>Paper</TH>
                <TH className="text-right">End-semester marks</TH>
                <TH>Grade</TH>
                <TH>Applications</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {reval.papers.map((pp) => (
                <TR key={pp.scriptId}>
                  <TD><span className="font-mono text-xs text-muted-foreground">{pp.code}</span> {pp.title}</TD>
                  <TD className="text-right">{pp.marks}/{pp.max}</TD>
                  <TD><Badge tone={GRADE_TONE[pp.grade] ?? "neutral"}>{pp.grade}</Badge></TD>
                  <TD>
                    <div className="flex flex-col gap-1 text-xs">
                      {pp.requests.map((r) => (
                        <span key={r.id}>
                          <Badge tone={r.status === "DECIDED" ? (r.outcome === "REVISED" ? "green" : "neutral") : "amber"}>
                            {r.type === "REVALUATION" ? "Revaluation" : "Scrutiny"} · {r.status === "DECIDED" ? (r.outcome === "REVISED" ? `revised to ${r.revisedMarks}` : "unchanged") : "in process"}
                          </Badge>
                        </span>
                      ))}
                      {!pp.requests.length && <span className="text-muted-foreground">—</span>}
                    </div>
                  </TD>
                  <TD className="text-right">
                    {user.role === "STUDENT" && reval.open && (
                      <ApplyForm scriptId={pp.scriptId} code={pp.code} feeRevaluation={reval.params.feeRevaluation} feeScrutiny={reval.params.feeScrutiny} existing={pp.requests.map((r) => r.type)} />
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card>
        <CardHeader
          title="Consolidated transcript"
          description="All semesters, credits, SGPA and CGPA in one QR-verifiable document"
          action={user.role === "STUDENT" && history.length > 0 ? <StudentCopyButton /> : undefined}
        />
        {transcripts.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted-foreground">
            No transcripts issued yet. Download a student copy for reference; official transcripts are issued by the Office of the Controller of Examinations on request.
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Type</TH>
                <TH>Purpose</TH>
                <TH>Issued</TH>
                <TH>Verification</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {transcripts.map((t) => {
                const tp = t.payload as unknown as TranscriptPayload;
                return (
                  <TR key={t.id}>
                    <TD><Badge tone={tp.variant === "OFFICIAL" ? "green" : "neutral"}>{tp.variant === "OFFICIAL" ? "Official" : "Student copy"}</Badge></TD>
                    <TD className="text-sm text-muted-foreground">{tp.purpose ?? "—"}</TD>
                    <TD className="text-xs">{formatDate(t.issuedAt, true)}</TD>
                    <TD><a href={`/verify/${t.verifyCode}`} target="_blank" className="font-mono text-xs text-brand-700 hover:underline">{t.verifyCode}</a></TD>
                    <TD className="text-right"><a href={`/api/transcript/${t.id}`} target="_blank" className="text-sm font-medium text-brand-700 hover:underline">Download</a></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Academic history" description="SGPA / CGPA across all published semesters" />
        <Table>
          <THead>
            <tr>
              <TH>Semester</TH>
              <TH className="text-right">Credits</TH>
              <TH className="text-right">SGPA</TH>
              <TH className="text-right">CGPA</TH>
              <TH>Result</TH>
            </tr>
          </THead>
          <tbody>
            {history.map((h) => (
              <TR key={h.id}>
                <TD>Semester {h.semester}</TD>
                <TD className="text-right">{h.credits}</TD>
                <TD className="text-right">{h.sgpa.toFixed(2)}</TD>
                <TD className="text-right font-medium">{h.cgpa.toFixed(2)}</TD>
                <TD><Badge tone={h.result === "PASS" ? "green" : "red"}>{h.result}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
