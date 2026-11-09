import { Download, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import type { GradeSheetPayload } from "@/lib/results/workflow";
import type { TranscriptPayload } from "@/lib/results/transcript";
import { StudentCopyButton } from "../../transcripts/transcript-buttons";
import { revaluationOptions } from "@/lib/results/revaluation";
import { publishedSemesters } from "@/lib/results/engine";
import { getT } from "@/lib/i18n/server";
import { ApplyForm } from "../../revaluations/client";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants, type BadgeTone } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const GRADE_TONE: Record<string, BadgeTone> = { O: "green", "A+": "green", A: "green", "B+": "blue", B: "blue", C: "amber", F: "red", AB: "red", NA: "red", W: "violet" };

export default async function MyResultsPage() {
  const user = await requirePage("/me/results");
  const t = await getT();
  const studentId = user.studentId ?? user.wardId;
  if (!studentId) return <EmptyState title={t("No student record linked")} />;
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
        eyebrow={user.role === "PARENT" ? t("Parent portal · read-only") : t("Student portal")}
        title={t("Results & grade sheets")}
        description={`${student.name} · ${student.rollNo} · ${student.batch.name}`}
        actions={
          latest && (
            <a href={`/api/grade-sheet/${latest.id}`} target="_blank" className={buttonVariants({ variant: "success" })}>
              <Download className="h-4 w-4" /> {t("Download grade sheet")}
            </a>
          )
        }
      />
      {!p ? (
        <Callout tone="amber" title={t("Results not yet published")}>
          {t("Results for the current semester will appear here as soon as the University publishes them. You will also receive an SMS and e-mail.")}
        </Callout>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t("SGPA · Semester {n}", { n: p.semester })} value={p.sgpa.toFixed(2)} tone="brand" />
            <Stat label="CGPA" value={p.cgpa.toFixed(2)} tone="green" hint={p.division ? t.loose(p.division) : undefined} />
            <Stat label={t("Credits earned")} value={`${p.earnedCredits}/${p.credits}`} />
            <Stat label={t("Result")} value={<Badge tone={p.result === "PASS" ? "green" : "red"}>{p.result === "PASS" ? t("Pass") : t("Backlog")}</Badge>} />
          </div>
          <Card>
            <CardHeader
              title={t("Semester {n} grade sheet", { n: p.semester })}
              description={t("{exam} · published {date}", { exam: p.exam.name, date: formatDate(p.publishedOn, true) })}
              action={
                <a href={`/verify/${latest.verifyCode}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  <ShieldCheck className="h-4 w-4" /> {t("Verify ({code})", { code: latest.verifyCode })}
                </a>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>{t("Code")}</TH>
                  <TH>{t("Course")}</TH>
                  <TH className="text-right">{t("Credits")}</TH>
                  <TH className="text-right">{t("Marks")}</TH>
                  <TH>{t("Grade")}</TH>
                  <TH className="text-right">{t("Grade points")}</TH>
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
            title={t("Revaluation & scrutiny")}
            description={
              reval.open
                ? t("Apply by {date} · revaluation ₹{rf}, scrutiny ₹{sf} per paper · up to {n} papers", { date: formatDate(reval.deadline), rf: reval.params.feeRevaluation, sf: reval.params.feeScrutiny, n: reval.params.maxPapers })
                : t("The application window closed on {date}", { date: formatDate(reval.deadline) })
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>{t("Paper")}</TH>
                <TH className="text-right">{t("End-semester marks")}</TH>
                <TH>{t("Grade")}</TH>
                <TH>{t("Applications")}</TH>
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
                            {r.type === "REVALUATION" ? t("Revaluation") : t("Scrutiny")} · {r.status === "DECIDED" ? (r.outcome === "REVISED" ? t("revised to {m}", { m: r.revisedMarks ?? "—" }) : t("unchanged")) : t("in process")}
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
          title={t("Consolidated transcript")}
          description={t("All semesters, credits, SGPA and CGPA in one QR-verifiable document")}
          action={user.role === "STUDENT" && history.length > 0 ? <StudentCopyButton /> : undefined}
        />
        {transcripts.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted-foreground">
            {t("No transcripts issued yet. Download a student copy for reference; official transcripts are issued by the Office of the Controller of Examinations on request.")}
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("Type")}</TH>
                <TH>{t("Purpose")}</TH>
                <TH>{t("Issued")}</TH>
                <TH>{t("Verification")}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {transcripts.map((tr) => {
                const tp = tr.payload as unknown as TranscriptPayload;
                return (
                  <TR key={tr.id}>
                    <TD><Badge tone={tp.variant === "OFFICIAL" ? "green" : "neutral"}>{tp.variant === "OFFICIAL" ? t("Official") : t("Student copy")}</Badge></TD>
                    <TD className="text-sm text-muted-foreground">{tp.purpose ?? "—"}</TD>
                    <TD className="text-xs">{formatDate(tr.issuedAt, true)}</TD>
                    <TD><a href={`/verify/${tr.verifyCode}`} target="_blank" className="font-mono text-xs text-brand-700 hover:underline">{tr.verifyCode}</a></TD>
                    <TD className="text-right"><a href={`/api/transcript/${tr.id}`} target="_blank" className="text-sm font-medium text-brand-700 hover:underline">{t("Download")}</a></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title={t("Academic history")} description={t("SGPA / CGPA across all published semesters")} />
        <Table>
          <THead>
            <tr>
              <TH>{t("Semester")}</TH>
              <TH className="text-right">{t("Credits")}</TH>
              <TH className="text-right">SGPA</TH>
              <TH className="text-right">CGPA</TH>
              <TH>{t("Result")}</TH>
            </tr>
          </THead>
          <tbody>
            {history.map((h) => (
              <TR key={h.id}>
                <TD>{t("Semester {n}", { n: h.semester })}</TD>
                <TD className="text-right">{h.credits}</TD>
                <TD className="text-right">{h.sgpa.toFixed(2)}</TD>
                <TD className="text-right font-medium">{h.cgpa.toFixed(2)}</TD>
                <TD><Badge tone={h.result === "PASS" ? "green" : "red"}>{h.result === "PASS" ? t("Pass") : t("Backlog")}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
