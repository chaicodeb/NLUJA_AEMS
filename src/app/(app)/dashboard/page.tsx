import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ResetDemoButton } from "./reset-demo-button";

const STAGES = [
  { key: "REGISTRATION", label: "Eligibility & registration" },
  { key: "SCHEDULED", label: "Admit cards & seating" },
  { key: "IN_PROGRESS", label: "Examination conduct" },
  { key: "EVALUATION", label: "Evaluation" },
  { key: "RESULT", label: "Result processing" },
  { key: "CLOSED", label: "Published" },
];

export default async function DashboardPage() {
  const user = await requirePage("/dashboard");
  if (user.role === "STUDENT" || user.role === "PARENT") return <StudentDashboard userId={user.id} />;

  const [students, batches, exam, pendingRelax, auditCount, recent] = await Promise.all([
    db.student.count(),
    db.batch.findMany({ include: { programme: true, _count: { select: { students: true } } }, orderBy: { code: "asc" } }),
    db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" } }, orderBy: { startDate: "desc" }, include: { _count: { select: { papers: true, registrations: true } } } }),
    db.relaxationRequest.count({ where: { status: "PENDING" } }),
    db.auditLog.count(),
    db.auditLog.findMany({ orderBy: { id: "desc" }, take: 6, include: { actor: true } }),
  ]);
  const stageIdx = exam ? STAGES.findIndex((s) => s.key === exam.status) : -1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ROLE_LABELS[user.role]}
        title={`Welcome, ${user.name.split(" ").slice(0, 3).join(" ")}`}
        description="Live status of the current examination cycle, drawn directly from the system database."
        actions={(user.role === "ADMIN" || user.role === "COE") && <ResetDemoButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={students} hint={`${batches.length} batches · 3 programmes`} tone="brand" />
        <Stat label="Papers this cycle" value={exam?._count.papers ?? 0} hint={exam?.name} />
        <Stat label="Exam registrations" value={exam?._count.registrations ?? 0} hint="Submitted by students" tone="green" />
        <Stat label="Pending VC relaxations" value={pendingRelax} hint="Attendance relaxation requests" tone={pendingRelax ? "amber" : "neutral"} />
      </div>

      {exam && (
        <Card>
          <CardHeader
            title={exam.name}
            description={`${formatDate(exam.startDate)} – ${formatDate(exam.endDate)} · ${exam.type} examination · Fee ₹${exam.feeAmount}`}
            action={
              <Link href={`/exams/${exam.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                Open examination <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody>
            <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {STAGES.map((s, i) => {
                const done = i < stageIdx;
                const current = i === stageIdx;
                return (
                  <li key={s.key} className={`rounded-lg border p-3 text-sm ${current ? "border-brand-300 bg-brand-50" : done ? "border-leaf-100 bg-leaf-50" : "border-border"}`}>
                    <div className="flex items-center gap-2">
                      {done ? <CheckCircle2 className="h-4 w-4 text-leaf-600" /> : <Circle className={`h-4 w-4 ${current ? "text-brand-600" : "text-muted-foreground"}`} />}
                      <span className="text-xs text-muted-foreground">Stage {i + 1}</span>
                    </div>
                    <div className="mt-1 font-medium">{s.label}</div>
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Batches in this cycle" description="Each batch is evaluated against the curriculum version it was admitted under." />
          <Table>
            <THead>
              <tr>
                <TH>Batch</TH>
                <TH>Programme</TH>
                <TH>Semester</TH>
                <TH className="text-right">Students</TH>
              </tr>
            </THead>
            <tbody>
              {batches.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.name}</TD>
                  <TD>{b.programme.code === "BALLB" ? "B.A. LL.B. (Hons.)" : "LL.M."}</TD>
                  <TD>Semester {b.currentSemester}</TD>
                  <TD className="text-right">{b._count.students}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            description={`${auditCount} entries in the tamper-evident audit trail`}
            action={<Link href="/audit" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>}
          />
          <ul className="divide-y divide-border">
            {recent.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={a.action.includes("DENIED") || a.action.includes("FAILED") ? "red" : "neutral"}>{a.action}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(a.at, true)}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">{a.actor?.name ?? "System"}</span> — {a.summary}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

async function StudentDashboard({ userId }: { userId: string }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { student: true, ward: true } });
  const student = user.student ?? user.ward;
  if (!student) return <PageHeader title="No student linked" />;
  const full = await db.student.findUniqueOrThrow({
    where: { id: student.id },
    include: {
      batch: { include: { programme: true } },
      semResults: { where: { run: { status: "PUBLISHED" } }, orderBy: { semester: "asc" } },
      enrolments: { include: { course: true, attendance: true }, where: { status: "ACTIVE" } },
    },
  });
  const latest = full.semResults.at(-1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.role === "PARENT" ? "Parent portal · read-only" : "Student portal"}
        title={full.name}
        description={`${full.batch.name} · Roll No. ${full.rollNo} · UID ${full.uid}`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Current semester" value={`Semester ${full.batch.currentSemester}`} tone="brand" />
        <Stat label="CGPA" value={latest?.cgpa.toFixed(2) ?? "—"} hint={latest ? `After semester ${latest.semester}` : undefined} tone="green" />
        <Stat label="Courses this semester" value={full.enrolments.length} />
        <Stat label="ABC ID" value={<span className="text-base">{full.abcId}</span>} hint="Academic Bank of Credits" />
      </div>
      <Card>
        <CardHeader title="Attendance this semester" description="Updated from faculty entry and biometric records" />
        <Table>
          <THead>
            <tr>
              <TH>Course</TH>
              <TH className="text-right">Held</TH>
              <TH className="text-right">Attended</TH>
              <TH className="text-right">%</TH>
            </tr>
          </THead>
          <tbody>
            {full.enrolments.map((e) => {
              const p = e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0;
              return (
                <TR key={e.id}>
                  <TD>
                    <span className="font-mono text-xs text-muted-foreground">{e.course.code}</span> {e.course.title}
                  </TD>
                  <TD className="text-right">{e.attendance?.classesHeld}</TD>
                  <TD className="text-right">{e.attendance?.classesAttended}</TD>
                  <TD className="text-right">
                    <Badge tone={p >= 75 ? "green" : p >= 70 ? "amber" : "red"}>{p.toFixed(1)}%</Badge>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Semester history" description="SGPA / CGPA (migrated and current records)" />
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
            {full.semResults.map((r) => (
              <TR key={r.id}>
                <TD>Semester {r.semester}</TD>
                <TD className="text-right">{r.credits}</TD>
                <TD className="text-right">{r.sgpa.toFixed(2)}</TD>
                <TD className="text-right font-medium">{r.cgpa.toFixed(2)}</TD>
                <TD>
                  <Badge tone="green">{r.result}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
