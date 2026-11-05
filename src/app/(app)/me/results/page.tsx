import { Download, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import type { GradeSheetPayload } from "@/lib/results/workflow";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants, type BadgeTone } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const GRADE_TONE: Record<string, BadgeTone> = { O: "green", "A+": "green", A: "green", "B+": "blue", B: "blue", C: "amber", F: "red", AB: "red", NA: "red", W: "violet" };

export default async function MyResultsPage() {
  const user = await requirePage("/me/results");
  const studentId = user.studentId ?? user.wardId;
  if (!studentId) return <EmptyState title="No student record linked" />;
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: true } });
  const sheets = await db.document.findMany({ where: { studentId, type: "GRADE_SHEET", revoked: false }, orderBy: { issuedAt: "desc" } });
  const history = await db.semesterResult.findMany({ where: { studentId, run: { status: "PUBLISHED" } }, orderBy: { semester: "asc" } });
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
