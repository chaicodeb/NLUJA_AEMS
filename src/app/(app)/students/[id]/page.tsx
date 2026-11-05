import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { TranscriptPayload } from "@/lib/results/transcript";
import { IssueOfficialForm } from "../../transcripts/transcript-buttons";
import { PUBLISHED_ORDER, firstPerSemester } from "@/lib/results/engine";

export default async function StudentDetail({ params }: PageProps<"/students/[id]">) {
  const user = await requirePage("/students");
  const canIssue = ["COE", "REGISTRAR", "ADMIN"].includes(user.role);
  const { id } = await params;
  const transcripts = await db.document.findMany({ where: { studentId: id, type: "TRANSCRIPT", revoked: false }, orderBy: { issuedAt: "desc" } });
  const s = await db.student.findUnique({
    where: { id },
    include: {
      batch: { include: { programme: true, curriculumVersion: true } },
      enrolments: {
        where: { status: "ACTIVE" },
        include: { course: { include: { scheme: { include: { components: { orderBy: { sortOrder: "asc" } } } } } }, attendance: true, markEntries: true },
        orderBy: { course: { code: "asc" } },
      },
      semResults: { where: { run: { status: "PUBLISHED" } }, orderBy: PUBLISHED_ORDER },
    },
  });
  if (!s) notFound();
  s.semResults = firstPerSemester(s.semResults);

  const totalHeld = s.enrolments.reduce((a, e) => a + (e.attendance?.classesHeld ?? 0), 0);
  const totalAtt = s.enrolments.reduce((a, e) => a + (e.attendance?.classesAttended ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`UID ${s.uid}`} title={s.name} description={`${s.batch.name} · ${s.batch.curriculumVersion.name}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="space-y-2 text-sm">
            {[
              ["Roll No.", s.rollNo],
              ["Programme", s.batch.programme.name],
              ["Current semester", s.batch.currentSemester],
              ["Gender", s.gender === "F" ? "Female" : "Male"],
              ["Date of birth", s.dob ? formatDate(s.dob) : "—"],
              ["Category", s.category],
              ["ABC ID", s.abcId],
              ["Email", s.email],
              ["Parent / Guardian", `${s.parentName} · ${s.parentPhone}`],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 border-b border-border/60 pb-1.5 last:border-0">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Semester history" description="Includes records migrated from the legacy system" />
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
              {s.semResults.map((r) => (
                <TR key={r.id}>
                  <TD>Semester {r.semester}</TD>
                  <TD className="text-right">{r.credits}</TD>
                  <TD className="text-right">{r.sgpa.toFixed(2)}</TD>
                  <TD className="text-right font-medium">{r.cgpa.toFixed(2)}</TD>
                  <TD><Badge tone={r.result === "PASS" ? "green" : "red"}>{r.result}</Badge></TD>
                </TR>
              ))}
              {s.semResults.length === 0 && (
                <TR><TD colSpan={5} className="text-center text-muted-foreground">First semester — no previous results</TD></TR>
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Current semester — attendance & internal assessment"
          description={`Aggregate attendance ${totalHeld ? ((totalAtt / totalHeld) * 100).toFixed(2) : 0}% (${totalAtt}/${totalHeld} classes)`}
        />
        <Table>
          <THead>
            <tr>
              <TH>Course</TH>
              <TH className="text-right">Attendance</TH>
              <TH>Internal marks (submitted by faculty)</TH>
            </tr>
          </THead>
          <tbody>
            {s.enrolments.map((e) => {
              const p = e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0;
              return (
                <TR key={e.id}>
                  <TD>
                    <div className="font-medium">{e.course.title}</div>
                    <div className="font-mono text-xs text-muted-foreground">{e.course.code} · {e.course.credits} credits</div>
                  </TD>
                  <TD className="text-right">
                    <Badge tone={p >= 75 ? "green" : p >= 70 ? "amber" : "red"}>{p.toFixed(2)}%</Badge>
                    <div className="mt-0.5 text-xs text-muted-foreground">{e.attendance?.classesAttended}/{e.attendance?.classesHeld}</div>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {e.course.scheme.components.map((c) => {
                        const m = e.markEntries.find((x) => x.componentId === c.id);
                        return (
                          <span key={c.id} className="rounded border border-border bg-white px-2 py-0.5 text-xs">
                            <span className="text-muted-foreground">{c.code}</span>{" "}
                            <span className="font-medium">{m?.marks ?? (c.source === "EXAM" ? "awaiting exam" : "—")}</span>
                            <span className="text-muted-foreground">/{c.maxMarks}</span>
                          </span>
                        );
                      })}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Consolidated transcripts"
          description="Official transcripts are digitally signed by the Controller of Examinations; every issue is logged"
          action={transcripts.length > 0 ? <Badge tone="brand">{transcripts.length} issued</Badge> : undefined}
        />
        <CardBody className="space-y-4">
          {canIssue && s.semResults.length > 0 && <IssueOfficialForm studentId={s.id} />}
          {transcripts.length > 0 && (
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
                      <TD className="text-right"><a href={`/api/transcript/${t.id}`} target="_blank" className="text-sm font-medium text-brand-700 hover:underline">Open PDF</a></TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
          {transcripts.length === 0 && !canIssue && <p className="text-sm text-muted-foreground">No transcripts issued.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
