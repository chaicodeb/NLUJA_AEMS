import Link from "next/link";
import { ArrowRight, Banknote, BellRing, CalendarClock, CheckCircle2, Circle, CircleAlert, Download, FileBadge, GraduationCap, MessagesSquare, NotebookPen, PenLine, Stamp } from "lucide-react";
import { studentFeedback } from "@/lib/feedback/feedback";
import { DEPARTMENTS } from "@/lib/convocation/degree";
import { departmentsFor, exitRegister } from "@/lib/exit/exit";
import { cycleOverview } from "@/lib/admissions/admissions";
import { AGENT_ROLES, CATEGORIES, slaState } from "@/lib/helpdesk/shared";
import { dueClassCount } from "@/lib/attendance/daily";
import { PUBLISHED_ORDER, firstPerSemester } from "@/lib/results/engine";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requirePage, requireUser, type CurrentUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { DEMO_STAGES } from "@/lib/demo/stages";
import { getActiveRule } from "@/lib/rules/store";
import { asParams, type AttendanceParams } from "@/lib/rules/engine";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DemoStageControl } from "./reset-demo-button";
import { AttendanceChart, EligibilityPie, EvaluationProgressChart, ResultsByBatchChart } from "./charts";

export const maxDuration = 300;

const STAGES = [
  { key: "REGISTRATION", label: "Eligibility & registration" },
  { key: "SCHEDULED", label: "Admit cards & seating" },
  { key: "EVALUATION", label: "Evaluation" },
  { key: "RESULT", label: "Result processing" },
  { key: "CLOSED", label: "Published" },
];

type ActionItem = { label: string; href: string; tone: "amber" | "red" | "blue" | "green" };

export default async function DashboardPage() {
  if ((await requireUser()).role === "APPLICANT") redirect("/application");
  const user = await requirePage("/dashboard");
  if (user.role === "STUDENT" || user.role === "PARENT") return <StudentDashboard user={user} />;
  if (user.role === "FACULTY" || user.role === "EVALUATOR") return <TeachingDashboard user={user} />;
  if (["LIBRARIAN", "WARDEN", "ACCOUNTS"].includes(user.role)) return <DeskDashboard user={user} />;
  return <StaffDashboard user={user} />;
}

async function DeskDashboard({ user }: { user: CurrentUser }) {
  const [department] = departmentsFor(user.role);
  const [counts, items] = await Promise.all([db.clearance.groupBy({ by: ["status"], where: { department }, _count: { _all: true } }), exitItems(user.role)]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={ROLE_LABELS[user.role]} title={`Welcome, ${user.name}`} description={user.designation ?? undefined} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting no-dues decision" value={count("PENDING")} tone={count("PENDING") ? "amber" : "green"} />
        <Stat label="Dues outstanding" value={count("DUES")} tone={count("DUES") ? "red" : "neutral"} />
        <Stat label="Cleared" value={count("CLEARED")} tone="green" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/clearance" className={buttonVariants({ variant: "accent" })}>
          <Stamp className="h-4 w-4" /> Open the {DEPARTMENTS[department].toLowerCase()} no-dues desk
        </Link>
        {user.role === "ACCOUNTS" && (
          <Link href="/exit" className={buttonVariants({ variant: "outline" })}>
            <Banknote className="h-4 w-4" /> Caution-deposit refunds
          </Link>
        )}
      </div>
      {items.length > 0 && (
        <Card>
          <CardHeader title="Needs your attention" />
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.label}>
                <Link href={i.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/40">
                  <span className="flex items-center gap-2"><CircleAlert className="h-4 w-4 text-amber-600" /> {i.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function currentExam() {
  return db.exam.findFirst({ where: { code: { not: "LEGACY-MIGRATION" }, type: "REGULAR", status: { not: "PLANNED" } }, orderBy: { startDate: "desc" } });
}

async function exitItems(role: Role): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  if (AGENT_ROLES.includes(role)) {
    const cats = Object.entries(CATEGORIES).filter(([, c]) => role === "ADMIN" || c.team === role).map(([k]) => k);
    const open = await db.ticket.findMany({ where: { category: { in: cats }, status: { notIn: ["RESOLVED", "CLOSED"] } } });
    const now = new Date();
    const breached = open.filter((t) => slaState(t, now).level === "breached").length;
    if (open.length) items.push({ label: `${open.length} open support ticket(s)${breached ? `, ${breached} past the SLA` : ""}`, href: "/helpdesk", tone: breached ? "red" : "blue" });
  }
  const desk = departmentsFor(role);
  if (desk.length === 1) {
    const n = await db.clearance.count({ where: { department: desk[0], status: "PENDING" } });
    if (n) items.push({ label: `${n} student(s) awaiting ${DEPARTMENTS[desk[0]].toLowerCase()} no-dues clearance`, href: "/clearance", tone: "amber" });
  }
  if (["REGISTRAR", "ACCOUNTS"].includes(role)) {
    const open = (await exitRegister()).filter((r) => r.status === "OPEN" && r.allCleared);
    const n = role === "REGISTRAR" ? open.filter((r) => r.surveyDone && !r.certificates.length).length : open.filter((r) => r.bankAccount && !r.refundedAt).length;
    if (n) items.push({ label: role === "REGISTRAR" ? `${n} cleared student(s) awaiting migration & character certificates` : `${n} caution-deposit refund(s) ready to release`, href: "/exit", tone: "amber" });
  }
  return items;
}

async function admissionItems(role: Role): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  const cycle = await db.admissionCycle.findFirst({ where: { status: { in: ["EVALUATION", "MERIT_PUBLISHED"] } }, orderBy: { opensAt: "desc" } });
  if (["ACADEMIC_STAFF", "REGISTRAR"].includes(role)) {
    const pending = await db.profileChangeRequest.count({ where: { status: "PENDING" } });
    if (pending) items.push({ label: `${pending} student profile correction(s) awaiting approval`, href: "/profile-requests", tone: "amber" });
  }
  if (!cycle) return items;
  if (["ACADEMIC_STAFF", "REGISTRAR"].includes(role)) {
    const n = await db.application.count({ where: { cycleId: cycle.id, status: "SUBMITTED" } });
    if (n) items.push({ label: `${cycle.name}: ${n} application(s) awaiting document verification`, href: `/admissions/${cycle.id}?status=SUBMITTED`, tone: "amber" });
  }
  if (["HOD", "REGISTRAR"].includes(role) && cycle.status === "EVALUATION") {
    const { pendingMarks } = await cycleOverview(cycle.id);
    if (pendingMarks.length) items.push({ label: `${cycle.name}: marks pending for ${pendingMarks.length} candidate(s)`, href: `/admissions/${cycle.id}?tab=marks`, tone: "blue" });
    else if (role === "REGISTRAR") items.push({ label: `${cycle.name}: all marks in — review and publish the merit list`, href: `/admissions/${cycle.id}?tab=merit`, tone: "red" });
  }
  return items;
}

async function actionItems(role: Role, examId: string | undefined): Promise<ActionItem[]> {
  const items: ActionItem[] = [...(await exitItems(role)), ...(await admissionItems(role))];
  if (role === "COE" || role === "ADMIN") {
    for (const p of await db.exam.findMany({ where: { status: "PLANNED", timetablePublishedAt: null } })) items.push({ label: `${p.name}: date sheet not yet published`, href: `/exams/${p.id}/timetable`, tone: "blue" });
  }
  if (["ADMIN", "REGISTRAR", "COE"].includes(role)) {
    const [waiting, failed] = await Promise.all([
      db.integrationJob.count({ where: { connector: "DIGILOCKER", status: "PENDING" } }),
      db.integrationJob.count({ where: { connector: "DIGILOCKER", status: "FAILED" } }),
    ]);
    if (failed) items.push({ label: `${failed} DigiLocker deliver${failed === 1 ? "y" : "ies"} failed — check ABC IDs`, href: "/integrations", tone: "red" });
    if (waiting && role === "ADMIN") items.push({ label: `${waiting} document(s) waiting to be pushed to DigiLocker`, href: "/integrations", tone: "blue" });
  }
  if (!examId) return items;
  const [relax, processed, approved, pendingEvals, third, eligCount, regCount, seatCount, exam] = await Promise.all([
    db.relaxationRequest.count({ where: { status: "PENDING" } }),
    db.resultRun.findFirst({ where: { examId, status: "PROCESSED" } }),
    db.resultRun.findFirst({ where: { examId, status: "APPROVED" } }),
    db.evaluation.count({ where: { script: { examPaper: { examId } }, status: { not: "LOCKED" } } }),
    db.answerScript.count({ where: { examPaper: { examId }, status: "THIRD_EVALUATION" } }),
    db.eligibility.count({ where: { examId } }),
    db.examRegistration.count({ where: { examId } }),
    db.seatAllocation.count({ where: { examPaper: { examId } } }),
    db.exam.findUniqueOrThrow({ where: { id: examId } }),
  ]);
  const relaxable = await db.eligibility.count({ where: { examId, status: "INELIGIBLE", relaxable: true } });
  const [sheetsToVerify, sheetsOpen] = await Promise.all([
    db.internalMarksSheet.count({ where: { academicYear: exam.academicYear, status: "SUBMITTED" } }),
    db.internalMarksSheet.count({ where: { academicYear: exam.academicYear, status: { in: ["DRAFT", "RETURNED"] } } }),
  ]);
  const [pendingLeave, dueClasses, openForms] = await Promise.all([
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    dueClassCount(),
    db.feedbackForm.findMany({ where: { status: { in: ["OPEN", "CLOSED"] }, releasedToFaculty: false }, include: { _count: { select: { responses: true } } } }),
  ]);
  if (role === "IQAC") {
    for (const f of openForms) items.push({ label: f.status === "OPEN" ? `${f.title}: open, ${f._count.responses} responses so far` : `${f.title}: closed — release results to teachers`, href: `/feedback/${f.id}`, tone: f.status === "OPEN" ? "blue" : "amber" });
  }
  if (["HOD", "ACADEMIC_STAFF"].includes(role) && pendingLeave) items.push({ label: `${pendingLeave} leave application(s) awaiting decision`, href: "/attendance/leave", tone: "amber" });
  if (["ACADEMIC_STAFF", "COE", "HOD"].includes(role) && dueClasses) items.push({ label: `${dueClasses} class(es) held but attendance not yet marked`, href: "/attendance/classes", tone: "blue" });
  if ((role === "HOD" || role === "COE") && sheetsToVerify) items.push({ label: `${sheetsToVerify} internal-marks sheet(s) awaiting verification`, href: "/marks?status=SUBMITTED", tone: "amber" });
  if (["COE", "EXAM_STAFF", "ACADEMIC_STAFF", "HOD"].includes(role) && sheetsOpen) items.push({ label: `${sheetsOpen} internal-marks sheet(s) not yet submitted by teachers`, href: "/marks?status=open", tone: "blue" });

  if (role === "VC") {
    if (relax) items.push({ label: `${relax} attendance relaxation request(s) awaiting your decision`, href: "/relaxations", tone: "amber" });
    if (approved) items.push({ label: "Approved results awaiting your release", href: `/results/${approved.id}`, tone: "red" });
  }
  if (role === "COE" || role === "ADMIN") {
    if (!eligCount) items.push({ label: "Run the attendance eligibility check", href: `/exams/${examId}?tab=eligibility`, tone: "blue" });
    if (regCount && !seatCount) items.push({ label: `${regCount} registrations received — generate the seating plan`, href: `/exams/${examId}?tab=seating`, tone: "blue" });
    if (seatCount && !exam.admitCardsPublished) items.push({ label: "Seating ready — publish admit cards", href: `/exams/${examId}?tab=seating`, tone: "amber" });
    if (pendingEvals) items.push({ label: `${pendingEvals} evaluation(s) pending${third ? `, ${third} third evaluation(s)` : ""}`, href: `/exams/${examId}?tab=scripts`, tone: "amber" });
    if (processed) items.push({ label: "Processed results awaiting your verification", href: `/results/${processed.id}`, tone: "red" });
  }
  if (role === "EXAM_STAFF") {
    if (exam.registrationOpen) items.push({ label: `Registration open — ${regCount} received`, href: `/exams/${examId}?tab=registrations`, tone: "blue" });
    if (exam.status === "EVALUATION" && !pendingEvals) items.push({ label: "All scripts evaluated — process results", href: "/results", tone: "red" });
  }
  if (role === "ACADEMIC_STAFF" && relaxable) {
    items.push({ label: `${relaxable} student course(s) within the relaxation band without a request`, href: `/exams/${examId}?tab=eligibility&status=INELIGIBLE`, tone: "amber" });
  }
  return items;
}

async function StaffDashboard({ user }: { user: CurrentUser }) {
  const exam = await currentExam();
  const [students, batches, pendingRelax, auditCount, recent, items] = await Promise.all([
    db.student.count({ where: { status: "ACTIVE" } }),
    db.batch.findMany({ where: { students: { some: { status: "ACTIVE" } } }, include: { programme: true, _count: { select: { students: true } } }, orderBy: { code: "asc" } }),
    db.relaxationRequest.count({ where: { status: "PENDING" } }),
    db.auditLog.count(),
    db.auditLog.findMany({ orderBy: { id: "desc" }, take: 7, include: { actor: true } }),
    actionItems(user.role, exam?.id),
  ]);

  const enrolments = await db.enrolment.findMany({ where: { academicYear: exam?.academicYear, status: "ACTIVE" }, include: { attendance: true, student: { include: { batch: true } } } });
  const rules = new Map<string, AttendanceParams>();
  for (const b of batches) {
    const r = await getActiveRule("ATTENDANCE", b.programmeId);
    if (r) rules.set(b.programmeId, asParams<AttendanceParams>(r));
  }
  const bands = [
    { band: "< 65%", min: 0, max: 65, tone: "red" as const },
    { band: "65–70%", min: 65, max: 70, tone: "amber" as const },
    { band: "70–75%", min: 70, max: 75, tone: "amber" as const },
    { band: "75–85%", min: 75, max: 85, tone: "green" as const },
    { band: "85%+", min: 85, max: 101, tone: "green" as const },
  ];
  const pcts = enrolments.map((e) => (e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0));
  const attendanceData = bands.map((b) => ({ band: b.band, tone: b.tone, count: pcts.filter((p) => p >= b.min && p < b.max).length }));
  const shortfall = enrolments.filter((e) => {
    const p = e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0;
    const rule = rules.get(e.student.batch.programmeId);
    return rule ? p < rule.courseMinPct : false;
  }).length;

  const elig = exam ? await db.eligibility.groupBy({ by: ["status"], where: { examId: exam.id }, _count: { _all: true } }) : [];
  const eligData = elig.map((e) => ({ name: { ELIGIBLE: "Eligible", INELIGIBLE: "Ineligible", PENDING_RELAXATION: "Pending relaxation", RELAXED: "Relaxed" }[e.status] ?? e.status, value: e._count._all }));
  const papers = exam ? await db.examPaper.findMany({ where: { examId: exam.id }, include: { course: true, scripts: { select: { status: true } } }, orderBy: { date: "asc" } }) : [];
  const evalData = papers.filter((p) => p.scripts.length).map((p) => ({ paper: p.course.code, finalised: p.scripts.filter((s) => s.status === "FINALISED").length, pending: p.scripts.filter((s) => s.status !== "FINALISED").length }));
  const run = exam ? await db.resultRun.findFirst({ where: { examId: exam.id, status: { not: "WITHDRAWN" } }, orderBy: { processedAt: "desc" }, include: { semResults: { include: { student: { include: { batch: true } } } } } }) : null;
  const resultData = run
    ? batches.map((b) => {
        const rs = run.semResults.filter((s) => s.student.batchId === b.id);
        return { batch: b.code, pass: rs.filter((r) => r.result === "PASS").length, backlog: rs.filter((r) => r.result === "FAIL").length, withheld: rs.filter((r) => r.result === "WITHHELD").length, avgSgpa: rs.length ? rs.reduce((a, r) => a + r.sgpa, 0) / rs.length : 0 };
      })
    : [];
  const passRate = run && run.semResults.length ? Math.round((run.semResults.filter((r) => r.result === "PASS").length / run.semResults.length) * 100) : null;
  const stageIdx = exam ? STAGES.findIndex((s) => s.key === exam.status) : -1;
  const canPresent = user.role === "ADMIN" || user.role === "COE";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ROLE_LABELS[user.role]}
        title={`Welcome, ${user.name.split(" ").slice(0, 3).join(" ")}`}
        description="Live status of the current examination cycle, drawn directly from the system database."
        actions={canPresent && <DemoStageControl stages={DEMO_STAGES.map((s) => ({ ...s }))} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={students} hint={`${batches.length} batches · 3 programmes`} tone="brand" />
        <Stat label="Attendance shortfalls" value={shortfall} hint="Course registrations below the active rule" tone={shortfall ? "red" : "green"} />
        <Stat label="Pending VC relaxations" value={pendingRelax} hint="Attendance relaxation requests" tone={pendingRelax ? "amber" : "neutral"} />
        <Stat label={passRate == null ? "Results" : "Pass rate (latest run)"} value={passRate == null ? "—" : `${passRate}%`} hint={run ? `${run.status.toLowerCase()} · ${run.semResults.length} students` : "Not yet processed"} tone="green" />
      </div>

      {items.length > 0 && (
        <Card>
          <CardHeader title="Needs your attention" description="Generated from live workflow status for your role" />
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.label}>
                <Link href={i.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <CircleAlert className={`h-4 w-4 ${i.tone === "red" ? "text-red-600" : i.tone === "amber" ? "text-amber-600" : "text-sky-600"}`} />
                    {i.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
            <ol className="grid gap-3 sm:grid-cols-5">
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

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Attendance distribution" description="All course registrations this semester" />
          <CardBody><AttendanceChart data={attendanceData} /></CardBody>
        </Card>
        <Card>
          {evalData.length ? (
            <>
              <CardHeader title="Evaluation progress" description="Scripts finalised per paper" />
              <CardBody><EvaluationProgressChart data={evalData} /></CardBody>
            </>
          ) : (
            <>
              <CardHeader title="Examination eligibility" description={eligData.length ? "Decisions under the active rules" : "Not yet computed"} />
              <CardBody>{eligData.length ? <EligibilityPie data={eligData} /> : <EmptyState title="Eligibility not computed" />}</CardBody>
            </>
          )}
        </Card>
        <Card>
          <CardHeader title="Results by batch" description={run ? `Latest run · ${run.status.toLowerCase()}` : "Available after result processing"} />
          <CardBody>
            {resultData.length ? (
              <>
                <ResultsByBatchChart data={resultData} />
                <div className="mt-2 flex justify-around text-xs text-muted-foreground">
                  {resultData.map((r) => <span key={r.batch}>{r.batch}: avg SGPA <strong className="text-foreground">{r.avgSgpa.toFixed(2)}</strong></span>)}
                </div>
              </>
            ) : (
              <EmptyState title="No results yet" />
            )}
          </CardBody>
        </Card>
      </div>

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
                  <TD>{b.programme.code === "BALLB" ? "B.A. LL.B. (Hons.)" : b.programme.code === "LLM" ? "LL.M." : "Ph.D."}</TD>
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
            action={["ADMIN", "COE", "VC", "REGISTRAR"].includes(user.role) ? <Link href="/audit" className="text-sm font-medium text-brand-700 hover:underline">View all</Link> : undefined}
          />
          <ul className="divide-y divide-border">
            {recent.map((a) => (
              <li key={a.id} className="px-5 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={/DENIED|FAILED|BLOCKED/.test(a.action) ? "red" : /APPROVED|PUBLISHED|LOCKED/.test(a.action) ? "green" : "neutral"}>{a.action}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(a.at, true)}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-muted-foreground">
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

async function TeachingDashboard({ user }: { user: CurrentUser }) {
  const [courses, evals] = await Promise.all([
    db.course.findMany({
      where: { facultyId: user.id, enrolments: { some: {} } },
      include: { enrolments: { include: { attendance: true } }, marksSheets: true },
      orderBy: { code: "asc" },
    }),
    db.evaluation.groupBy({ by: ["status"], where: { evaluatorId: user.id }, _count: { _all: true } }),
  ]);
  const pending = evals.filter((e) => e.status !== "LOCKED").reduce((a, e) => a + e._count._all, 0);
  const done = evals.filter((e) => e.status === "LOCKED").reduce((a, e) => a + e._count._all, 0);
  const openSheets = courses.flatMap((c) => c.marksSheets).filter((s) => ["DRAFT", "RETURNED"].includes(s.status)).length;
  const dueClasses = await dueClassCount(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={ROLE_LABELS[user.role]} title={`Welcome, ${user.name}`} description={user.designation ?? undefined} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Courses this semester" value={courses.length} tone="brand" />
        <Stat label="Scripts pending evaluation" value={pending} tone={pending ? "amber" : "green"} hint={pending ? undefined : "All allocated scripts evaluated"} />
        <Stat label="Evaluations submitted" value={done} tone="green" />
      </div>
      {(pending > 0 || openSheets > 0 || dueClasses > 0) && (
        <div className="flex flex-wrap gap-3">
          {dueClasses > 0 && (
            <Link href="/attendance/classes" className={buttonVariants({ variant: "accent" })}>
              <CalendarClock className="h-4 w-4" /> Take attendance ({dueClasses} class{dueClasses === 1 ? "" : "es"} awaiting)
            </Link>
          )}
          {openSheets > 0 && (
            <Link href="/marks" className={buttonVariants({ variant: "default" })}>
              <NotebookPen className="h-4 w-4" /> Enter internal marks ({openSheets} sheet{openSheets === 1 ? "" : "s"} open)
            </Link>
          )}
          {pending > 0 && (
            <Link href="/evaluation" className={buttonVariants({ variant: "accent" })}>
              <PenLine className="h-4 w-4" /> Continue evaluating ({pending} pending)
            </Link>
          )}
        </div>
      )}
      {courses.length > 0 && (
        <Card>
          <CardHeader title="My courses" description="Attendance and internal assessment status" />
          <Table>
            <THead>
              <tr>
                <TH>Course</TH>
                <TH className="text-right">Students</TH>
                <TH className="text-right">Avg attendance</TH>
                <TH className="text-right">Below 70%</TH>
                <TH>Internal marks</TH>
              </tr>
            </THead>
            <tbody>
              {courses.map((c) => {
                const pcts = c.enrolments.map((e) => (e.attendance ? (e.attendance.classesAttended / e.attendance.classesHeld) * 100 : 0));
                const open = c.marksSheets.filter((s) => ["DRAFT", "RETURNED"].includes(s.status)).length;
                return (
                  <TR key={c.id}>
                    <TD><span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.title}</TD>
                    <TD className="text-right">{c.enrolments.length}</TD>
                    <TD className="text-right">{(pcts.reduce((a, b) => a + b, 0) / Math.max(1, pcts.length)).toFixed(1)}%</TD>
                    <TD className="text-right">{pcts.filter((p) => p < 70).length}</TD>
                    <TD>
                      <Link href="/marks">
                        <Badge tone={open ? "amber" : "green"}>{c.marksSheets.length - open}/{c.marksSheets.length} sheets submitted</Badge>
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

async function StudentDashboard({ user }: { user: CurrentUser }) {
  const student = user.student ?? user.ward;
  if (!student) return <PageHeader title="No student linked" />;
  const full = await db.student.findUniqueOrThrow({
    where: { id: student.id },
    include: {
      batch: { include: { programme: true } },
      semResults: { where: { run: { status: "PUBLISHED" } }, orderBy: PUBLISHED_ORDER },
      enrolments: { include: { course: true, attendance: true }, where: { status: "ACTIVE" }, orderBy: { course: { code: "asc" } } },
    },
  });
  const exam = await currentExam();
  const reg = exam ? await db.examRegistration.findUnique({ where: { examId_studentId: { examId: exam.id, studentId: full.id } } }) : null;
  const latest = firstPerSemester(full.semResults).at(-1);
  const isParent = user.role === "PARENT";
  const alerts = await db.attendanceAlert.findMany({ where: { studentId: full.id, level: { in: ["SHORTAGE", "CRITICAL", "NOTICE"] } }, orderBy: { createdAt: "desc" }, take: 2 });
  const feedbackDue = isParent ? 0 : (await studentFeedback(full.id)).items.filter((i) => !i.done).length;
  const exitOpen = isParent ? null : await db.exitRequest.findFirst({ where: { studentId: full.id, status: "OPEN" } });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={isParent ? "Parent portal · read-only" : "Student portal"} title={full.name} description={`${full.batch.name} · Roll No. ${full.rollNo} · UID ${full.uid}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Current semester" value={`Semester ${full.batch.currentSemester}`} tone="brand" />
        <Stat label="CGPA" value={latest?.cgpa.toFixed(2) ?? "—"} hint={latest ? `After semester ${latest.semester}${latest.division ? ` · ${latest.division}` : ""}` : undefined} tone="green" />
        <Stat label="Courses this semester" value={full.enrolments.length} />
        <Stat label="ABC ID" value={<span className="text-base">{full.abcId}</span>} hint="Academic Bank of Credits" />
      </div>
      {exam && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <FileBadge className="mt-0.5 h-5 w-5 text-brand-600" />
              <div className="flex-1">
                <div className="font-medium">{exam.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {reg ? (exam.admitCardsPublished ? "Registered · admit card available" : "Registered · admit card awaited") : exam.registrationOpen ? "Registration open" : "Registration closed"}
                </div>
              </div>
              {reg && exam.admitCardsPublished ? (
                <a href={`/api/admit-card/${reg.id}`} target="_blank" className={buttonVariants({ size: "sm", variant: "outline" })}><Download className="h-3.5 w-3.5" /> Admit card</a>
              ) : !isParent && exam.registrationOpen && !reg ? (
                <Link href="/me/exams" className={buttonVariants({ size: "sm" })}>Register</Link>
              ) : null}
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <GraduationCap className="mt-0.5 h-5 w-5 text-leaf-600" />
              <div className="flex-1">
                <div className="font-medium">Results</div>
                <div className="mt-1 text-sm text-muted-foreground">{exam.status === "CLOSED" ? "Semester results published" : "Results not yet published"}</div>
              </div>
              <Link href="/me/results" className={buttonVariants({ size: "sm", variant: "outline" })}>View</Link>
            </div>
          </Card>
        </div>
      )}
      {isParent && <Callout tone="blue">Read-only access to your ward&apos;s records, shared with consent under the University&apos;s data-sharing policy (DPDP Act, 2023).</Callout>}
      {feedbackDue > 0 && (
        <Link href="/me/feedback" className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 hover:bg-sky-100">
          <span className="flex items-center gap-2"><MessagesSquare className="h-4 w-4" /> {feedbackDue} anonymous feedback form{feedbackDue === 1 ? "" : "s"} awaiting you — about two minutes each</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {exitOpen && (
        <Link href="/me/exit" className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span className="flex items-center gap-2"><Stamp className="h-4 w-4" /> Exit formalities in progress — check your no-dues, refund and certificates</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {alerts.length > 0 && (
        <Link href="/me/attendance" className="block rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 hover:bg-red-100">
          <div className="flex items-center gap-2 font-semibold"><BellRing className="h-4 w-4" /> Attendance alert</div>
          {alerts.map((a) => (
            <div key={a.id} className="mt-1">{a.message} <span className="text-xs text-red-700/80">· {formatDate(a.createdAt, true)}</span></div>
          ))}
        </Link>
      )}
      <Card>
        <CardHeader title="Attendance this semester" description="Updated from faculty entry and biometric records" action={<Link href="/me/attendance" className="text-sm text-brand-700 hover:underline">Details & leave</Link>} />
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
                  <TD><span className="font-mono text-xs text-muted-foreground">{e.course.code}</span> {e.course.title}</TD>
                  <TD className="text-right">{e.attendance?.classesHeld}</TD>
                  <TD className="text-right">{e.attendance?.classesAttended}</TD>
                  <TD className="text-right"><Badge tone={p >= 75 ? "green" : p >= 70 ? "amber" : "red"}>{p.toFixed(1)}%</Badge></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
