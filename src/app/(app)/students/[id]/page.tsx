import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function StudentDetail({ params }: PageProps<"/students/[id]">) {
  await requirePage("/students");
  const { id } = await params;
  const s = await db.student.findUnique({
    where: { id },
    include: {
      batch: { include: { programme: true, curriculumVersion: true } },
      enrolments: {
        include: { course: { include: { scheme: { include: { components: { orderBy: { sortOrder: "asc" } } } } } }, attendance: true, markEntries: true },
        orderBy: { course: { code: "asc" } },
      },
      semResults: { orderBy: { semester: "asc" } },
    },
  });
  if (!s) notFound();

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
    </div>
  );
}
