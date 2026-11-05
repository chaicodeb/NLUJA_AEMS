import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requirePage } from "@/lib/session";
import { classesOverview } from "@/lib/attendance/daily";
import { countsAsPresent, istDate, istTime } from "@/lib/attendance/shared";
import { Badge, Callout, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";

const KIND: Record<string, string> = { LECTURE: "Lecture", TUTORIAL: "Tutorial", MOOT_PRACTICE: "Moot practice" };

export default async function ClassesPage() {
  const user = await requirePage("/attendance/classes");
  const teacher = user.role === "FACULTY";
  const { due, recent, courses } = await classesOverview(teacher ? user.id : null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title={teacher ? "My classes" : "Daily attendance"}
        description="Teachers mark each class on screen or pull the punch log from the classroom biometric reader. Course totals, eligibility and shortage alerts to students and parents update the moment a class is saved."
      />

      <Card>
        <CardHeader title="Classes awaiting attendance" description={due.length ? "Mark these classes now — totals and alerts depend on them" : "Every class held so far has been marked"} />
        {due.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">Nothing pending.</div>
        ) : (
          <ul className="divide-y divide-border">
            {due.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="font-medium"><span className="font-mono text-sm text-muted-foreground">{s.course.code}</span> {s.course.title}</div>
                    <div className="text-xs text-muted-foreground">{istDate(s.startsAt)} · {istTime(s.startsAt)} · {KIND[s.kind]}{!teacher && ` · ${s.course.faculty?.name ?? "—"}`}</div>
                  </div>
                </div>
                <Link href={`/attendance/classes/${s.id}`} className={buttonVariants({ size: "sm", variant: teacher ? "default" : "outline" })}>
                  {teacher ? "Take attendance" : "Open"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={teacher ? "My courses" : "Courses this semester"} description="Classes held against the plan, and students below or close to the minimum under the programme's attendance rule" />
        <Table>
          <THead>
            <tr>
              <TH>Course</TH>
              {!teacher && <TH>Teacher</TH>}
              <TH className="text-right">Classes held</TH>
              <TH className="text-right">Average</TH>
              <TH>Students at risk</TH>
            </tr>
          </THead>
          <tbody>
            {courses.map((c) => (
              <TR key={c.id}>
                <TD><span className="font-mono text-xs text-muted-foreground">{c.code}</span> <span className="text-sm">{c.title}</span></TD>
                {!teacher && <TD className="text-sm">{c.faculty}</TD>}
                <TD className="text-right tabular-nums">{c.held}/{c.planned}</TD>
                <TD className="text-right tabular-nums">{c.avg == null ? "—" : `${c.avg.toFixed(1)}%`}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {c.below > 0 && <Badge tone="red">{c.below} below {c.minPct}%</Badge>}
                    {c.warning > 0 && <Badge tone="amber">{c.warning} close</Badge>}
                    {!c.below && !c.warning && <Badge tone="green">None</Badge>}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Recently marked" description="Teachers can change a class on the day they mark it; later corrections need a reason and are logged" />
        <Table>
          <THead>
            <tr>
              <TH>Class</TH>
              <TH>When</TH>
              <TH>Source</TH>
              <TH className="text-right">Present</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {recent.map((s) => {
              const present = s.records.filter((r) => countsAsPresent(r.status)).length;
              return (
                <TR key={s.id}>
                  <TD><span className="font-mono text-xs text-muted-foreground">{s.course.code}</span> <span className="text-sm">{KIND[s.kind]}</span></TD>
                  <TD className="text-sm">{istDate(s.startsAt)} · {istTime(s.startsAt)}</TD>
                  <TD><Badge tone={s.source === "BIOMETRIC" ? "violet" : "neutral"}>{s.source === "BIOMETRIC" ? "Biometric" : "Teacher"}</Badge></TD>
                  <TD className={cn("text-right tabular-nums", present < s.records.length * 0.75 && "text-amber-700")}>{present}/{s.records.length}</TD>
                  <TD className="text-right">
                    <Link href={`/attendance/classes/${s.id}`} className="text-sm text-brand-700 hover:underline">View</Link>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {teacher && <Callout tone="blue">Approved duty leave (representing the University) counts as attendance. Approved medical leave is recorded and supports a relaxation request, but counts as absence.</Callout>}
    </div>
  );
}
