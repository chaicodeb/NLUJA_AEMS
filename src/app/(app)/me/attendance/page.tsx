import { BellRing } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { attendanceRule } from "@/lib/attendance/daily";
import { LEVEL_INFO, RECORD_STATUS, istDate, istTime, standing } from "@/lib/attendance/shared";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { LeaveForm } from "./leave-form";

export default async function MyAttendancePage() {
  const user = await requirePage("/me/attendance");
  const studentId = user.studentId ?? user.wardId;
  if (!studentId) return <EmptyState title="No student record linked" />;
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { batch: true } });
  const rule = await attendanceRule(student.batch.programmeId);
  const floor = rule?.relaxationEnabled ? rule.relaxedCourseMinPct : null;
  const [enrolments, alerts, leaves, absences] = await Promise.all([
    db.enrolment.findMany({ where: { studentId, status: "ACTIVE" }, include: { course: true, attendance: true }, orderBy: { course: { code: "asc" } } }),
    db.attendanceAlert.findMany({ where: { studentId }, include: { enrolment: { include: { course: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.leaveRequest.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    db.attendanceRecord.findMany({ where: { enrolment: { studentId }, status: { not: "PRESENT" } }, include: { session: { include: { course: true } } }, orderBy: { session: { startsAt: "desc" } }, take: 12 }),
  ]);
  const rows = enrolments.filter((e) => e.attendance).map((e) => ({ e, s: standing(e.attendance!.classesAttended, e.attendance!.classesHeld, e.course.plannedSessions, rule?.courseMinPct ?? 75, floor) }));
  const atRisk = rows.filter((r) => r.s.level === "SHORTAGE" || r.s.level === "CRITICAL");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.role === "PARENT" ? "Parent portal · read-only" : "Student portal"}
        title="Attendance"
        description={`${student.name} · ${student.rollNo} · minimum ${rule?.courseMinPct ?? "—"}% in every course${floor != null ? `; the Vice-Chancellor may relax this to ${floor}% on medical or emergency grounds` : ""}`}
      />
      {atRisk.length > 0 && (
        <Callout tone="red" title={`Attendance below the minimum in ${atRisk.length} course${atRisk.length === 1 ? "" : "s"}`}>
          {atRisk.map((r) => `${r.e.course.code} (${r.s.pct.toFixed(1)}%)`).join(", ")} — you may be barred from the end-semester examination in {atRisk.length === 1 ? "this course" : "these courses"}. Contact the Academic Section about relaxation.
        </Callout>
      )}

      <Card>
        <CardHeader title="Course-wise attendance" description="Updated as soon as your teacher marks a class" />
        <Table>
          <THead>
            <tr>
              <TH>Course</TH>
              <TH className="text-right">Attended</TH>
              <TH className="text-right">%</TH>
              <TH>Status</TH>
              <TH>What it means</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map(({ e, s }) => (
              <TR key={e.id}>
                <TD><span className="font-mono text-xs text-muted-foreground">{e.course.code}</span> {e.course.title}</TD>
                <TD className="text-right tabular-nums">{s.attended}/{s.held}<div className="text-[10px] text-muted-foreground">of {e.course.plannedSessions} planned</div></TD>
                <TD className={cn("text-right font-semibold tabular-nums", s.level === "OK" ? "text-leaf-700" : s.level === "WARNING" ? "text-amber-700" : "text-red-700")}>{s.pct.toFixed(1)}</TD>
                <TD><Badge tone={LEVEL_INFO[s.level].tone}>{LEVEL_INFO[s.level].label}</Badge></TD>
                <TD className="text-xs text-muted-foreground">{s.advice}{e.attendance!.medicalLeaveDays ? ` · ${e.attendance!.medicalLeaveDays} medical-leave class(es) on record` : ""}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alerts sent to you and your parent" description="SMS and e-mail, generated automatically from the attendance rule" />
          {alerts.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">No alerts.</div>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-3 text-sm">
                  <BellRing className={cn("mt-0.5 h-4 w-4 shrink-0", a.level === "WARNING" ? "text-amber-600" : a.level === "NOTICE" ? "text-sky-600" : "text-red-600")} />
                  <div>
                    <div>{a.message}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(a.createdAt, true)} · {a.channels}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent absences and leave" />
          <ul className="divide-y divide-border">
            {absences.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span><span className="font-mono text-xs text-muted-foreground">{a.session.course.code}</span> {istDate(a.session.startsAt)} · {istTime(a.session.startsAt)}</span>
                <Badge tone={RECORD_STATUS[a.status].tone}>{RECORD_STATUS[a.status].label}</Badge>
              </li>
            ))}
            {absences.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No absences recorded.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Leave applications" description="Duty leave (moot courts, University events) counts as attendance once approved; medical leave supports a relaxation request" />
        <div className="space-y-4 px-5 py-4">
          {leaves.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{l.type === "DUTY" ? "Duty leave" : "Medical leave"} · {formatDate(l.fromDate)} – {formatDate(l.toDate)}</div>
                <div className="text-xs text-muted-foreground">{l.reason}</div>
              </div>
              <Badge tone={l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : "amber"}>{l.status === "PENDING" ? "Awaiting approval" : l.status === "APPROVED" ? `Approved · ${l.sessions} classes` : "Rejected"}</Badge>
            </div>
          ))}
          {user.role === "STUDENT" && <LeaveForm />}
        </div>
      </Card>
    </div>
  );
}
