import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { getActiveRule } from "@/lib/rules/store";
import { asParams, type AttendanceParams } from "@/lib/rules/engine";
import { Badge, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";
import { WARNING_MARGIN, levelFor } from "@/lib/attendance/shared";
import { sevenDaysAgo } from "@/lib/attendance/daily";
import { NoticesButton } from "./client";

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const user = await requirePage("/attendance");
  const sp = await searchParams;
  const batches = await db.batch.findMany({ where: { students: { some: { status: "ACTIVE" } } }, orderBy: { code: "asc" }, include: { programme: true } });
  const batch = batches.find((b) => b.code === sp.batch) ?? batches[0];
  const rule = await getActiveRule("ATTENDANCE", batch.programmeId);
  const p = rule ? asParams<AttendanceParams>(rule) : null;

  const students = await db.student.findMany({
    where: { batchId: batch.id },
    orderBy: { rollNo: "asc" },
    include: { enrolments: { where: { status: "ACTIVE" }, include: { attendance: true, course: true }, orderBy: { course: { code: "asc" } } } },
  });
  const courses = students[0]?.enrolments.map((e) => e.course) ?? [];
  const floor = p?.relaxationEnabled ? p.relaxedCourseMinPct : null;
  const levels = students.flatMap((s) => s.enrolments.filter((e) => e.attendance?.classesHeld).map((e) => (p ? levelFor((e.attendance!.classesAttended / e.attendance!.classesHeld) * 100, p.courseMinPct, floor) : "OK")));
  const count = (l: string) => levels.filter((x) => x === l).length;
  const recentAlerts = await db.attendanceAlert.count({ where: { student: { batchId: batch.id }, createdAt: { gte: sevenDaysAgo() } } });
  const canNotify = ["HOD", "ACADEMIC_STAFF", "COE", "ADMIN"].includes(user.role);

  const tone = (pct: number) => {
    if (!p) return "";
    if (pct >= p.courseMinPct) return "text-leaf-700";
    if (p.relaxationEnabled && pct >= p.relaxedCourseMinPct) return "bg-amber-50 text-amber-800 font-semibold";
    return "bg-red-50 text-red-700 font-semibold";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance Management"
        title="Course-wise attendance register"
        description="Course totals roll up from every class marked by teachers or the biometric readers. Shortfalls are flagged using the active attendance rule for the programme."
      />
      <div className="flex flex-wrap gap-2">
        {batches.map((b) => (
          <Link
            key={b.id}
            href={`/attendance?batch=${b.code}`}
            className={cn("rounded-full border px-3 py-1.5 text-sm", b.id === batch.id ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-white hover:bg-muted")}
          >
            {b.name}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Below relaxation floor" value={count("CRITICAL")} tone={count("CRITICAL") ? "red" : "neutral"} hint={floor != null ? `under ${floor}% — not relaxable` : undefined} />
        <Stat label="Below minimum" value={count("SHORTAGE")} tone={count("SHORTAGE") ? "amber" : "neutral"} hint={p ? `${floor ?? "—"}–${p.courseMinPct}% — relaxation possible` : undefined} />
        <Stat label="Close to minimum" value={count("WARNING")} tone={count("WARNING") ? "amber" : "neutral"} hint={p ? `within ${WARNING_MARGIN} points of ${p.courseMinPct}%` : undefined} />
        <Stat label="Alerts sent (7 days)" value={recentAlerts} hint="SMS + e-mail to students and parents" tone="brand" />
      </div>
      <Card>
        <CardHeader
          title={batch.name}
          description={p ? `Rule ${rule?.key} v${rule?.version}: ${p.courseMinPct}% per course${p.relaxationEnabled ? `; relaxable to ${p.relaxedCourseMinPct}% with aggregate ≥ ${p.aggregateMinPct}%` : ""}` : "No attendance rule configured"}
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
              <Badge tone="green">Meets rule</Badge>
              <Badge tone="amber">Relaxation band</Badge>
              <Badge tone="red">Below floor</Badge>
              {canNotify && <NoticesButton batchId={batch.id} count={count("SHORTAGE") + count("CRITICAL")} />}
            </div>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              {courses.map((c) => (
                <TH key={c.id} className="text-right" title={c.title}>{c.code}</TH>
              ))}
              <TH className="text-right">Aggregate</TH>
            </tr>
          </THead>
          <tbody>
            {students.map((s) => {
              const held = s.enrolments.reduce((a, e) => a + (e.attendance?.classesHeld ?? 0), 0);
              const att = s.enrolments.reduce((a, e) => a + (e.attendance?.classesAttended ?? 0), 0);
              const agg = held ? (att / held) * 100 : 0;
              return (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/students/${s.id}`} className="font-medium hover:text-brand-700">{s.name}</Link>
                    <div className="font-mono text-xs text-muted-foreground">{s.rollNo}</div>
                  </TD>
                  {s.enrolments.map((e) => {
                    const pct = e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0;
                    return (
                      <TD key={e.id} className={cn("text-right tabular-nums", tone(pct))}>
                        {pct.toFixed(1)}
                        <div className="text-[10px] font-normal text-muted-foreground">{e.attendance?.classesAttended}/{e.attendance?.classesHeld}</div>
                      </TD>
                    );
                  })}
                  <TD className={cn("text-right font-medium tabular-nums", p && agg < p.aggregateMinPct && "text-red-700")}>{agg.toFixed(2)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
