import { requirePage } from "@/lib/session";
import { facultyLoad } from "@/lib/academics/curriculum";
import { Badge, Callout, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { FacultySelect } from "../curricula/[id]/client";

export default async function FacultyWorkloadPage() {
  const user = await requirePage("/academics/faculty");
  const { rows, unassigned, courses, faculty } = await facultyLoad("2026-27");
  const canAssign = ["ACADEMIC_STAFF", "HOD", "ADMIN"].includes(user.role);
  const options = faculty.map((f) => ({ id: f.id, name: f.name }));
  const max = Math.max(...rows.map((r) => r.weekly), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic Management"
        title="Faculty & teaching load"
        description="Courses running this semester and who teaches them. A reassignment hands the course's daily attendance and internal-marks sheet to the new teacher, and is recorded in the audit trail."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Courses running" value={courses.length} tone="brand" />
        <Stat label="Faculty" value={faculty.length} />
        <Stat label="Unassigned courses" value={unassigned.length} tone={unassigned.length ? "red" : "green"} />
      </div>
      {unassigned.length > 0 && <Callout tone="red">No teacher assigned: {unassigned.map((c) => c.code).join(", ")}.</Callout>}

      <Card>
        <CardHeader title="Load per teacher" description="Weekly contact hours estimated from planned sessions over a 13-week semester (UGC norm for direct teaching: 16 h Assistant Professor, 14 h Associate Professor; the demo has only three teachers)" />
        <Table>
          <THead>
            <tr>
              <TH>Teacher</TH>
              <TH>Courses</TH>
              <TH className="text-right">Credits</TH>
              <TH className="text-right">Students</TH>
              <TH>Hours / week</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.faculty.id}>
                <TD>
                  <div className="font-medium">{r.faculty.name}</div>
                  <div className="text-xs text-muted-foreground">{r.faculty.designation}{r.faculty.department ? ` · ${r.faculty.department}` : ""}</div>
                </TD>
                <TD><div className="flex flex-wrap gap-1">{r.courses.map((c) => <Badge key={c.id}>{c.code}</Badge>)}</div></TD>
                <TD className="text-right">{r.credits}</TD>
                <TD className="text-right">{r.students}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(r.weekly / max) * 100}%` }} />
                    </div>
                    <span className="text-sm">{r.weekly}</span>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Course allocation" description="This semester's courses with registered students" />
        <Table>
          <THead>
            <tr>
              <TH>Course</TH>
              <TH>Curriculum</TH>
              <TH className="text-right">Students</TH>
              <TH>Teacher</TH>
            </tr>
          </THead>
          <tbody>
            {courses.map((c) => (
              <TR key={c.id}>
                <TD><span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.title}</TD>
                <TD className="text-xs text-muted-foreground">{c.curriculumVersion.code} · Sem {c.semester}</TD>
                <TD className="text-right">{c._count.enrolments}</TD>
                <TD>{canAssign ? <FacultySelect courseId={c.id} value={c.facultyId} faculty={options} code={c.code} /> : options.find((f) => f.id === c.facultyId)?.name ?? "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
