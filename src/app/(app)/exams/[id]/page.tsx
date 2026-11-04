import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, PageHeader, Stat, Table, TD, TH, THead, TR, Callout } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { EligibilityControls, RelaxationButton } from "./eligibility-client";

const TABS = [
  { key: "papers", label: "Papers & schedule" },
  { key: "eligibility", label: "Eligibility" },
] as const;

const STATUS_TONE = { ELIGIBLE: "green", RELAXED: "blue", PENDING_RELAXATION: "amber", INELIGIBLE: "red" } as const;

export default async function ExamDetail({ params, searchParams }: PageProps<"/exams/[id]">) {
  const user = await requirePage("/exams");
  const { id } = await params;
  const sp = await searchParams;
  const tab = (sp.tab as string) ?? "eligibility";
  const exam = await db.exam.findUnique({
    where: { id },
    include: { papers: { include: { course: { include: { curriculumVersion: { include: { programme: true } } } }, setter: true }, orderBy: [{ date: "asc" }, { session: "asc" }] } },
  });
  if (!exam) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${exam.code} · ${exam.type} examination`}
        title={exam.name}
        description={`${formatDate(exam.startDate)} – ${formatDate(exam.endDate)} · ${exam.papers.length} papers · Examination fee ₹${exam.feeAmount}`}
        actions={<Badge tone="brand">{exam.status.replace("_", " ")}</Badge>}
      />
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/exams/${id}?tab=${t.key}`}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "papers" && (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Session</TH>
                <TH>Course</TH>
                <TH>Programme</TH>
                <TH className="text-right">Max marks</TH>
                <TH>Evaluation</TH>
                <TH>Paper setter</TH>
              </tr>
            </THead>
            <tbody>
              {exam.papers.map((p) => (
                <TR key={p.id}>
                  <TD className="whitespace-nowrap">{formatDate(p.date)}</TD>
                  <TD>{p.session === "FN" ? "10:00 AM" : "2:00 PM"} <span className="text-xs text-muted-foreground">({p.durationMins} min)</span></TD>
                  <TD>
                    <span className="font-mono text-xs text-muted-foreground">{p.course.code}</span> {p.course.title}
                  </TD>
                  <TD>{p.course.curriculumVersion.programme.code}</TD>
                  <TD className="text-right">{p.maxMarks}</TD>
                  <TD><Badge tone={p.evaluationMode === "DOUBLE" ? "violet" : "neutral"}>{p.evaluationMode}</Badge></TD>
                  <TD className="text-muted-foreground">{p.setter?.name ?? "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "eligibility" && <EligibilityTab examId={id} status={String(sp.status ?? "")} batch={String(sp.batch ?? "")} role={user.role} />}
    </div>
  );
}

async function EligibilityTab({ examId, status, batch, role }: { examId: string; status: string; batch: string; role: string }) {
  const rows = await db.eligibility.findMany({
    where: {
      examId,
      ...(status ? { status } : {}),
      ...(batch ? { enrolment: { student: { batch: { code: batch } } } } : {}),
    },
    include: { enrolment: { include: { student: { include: { batch: true } }, course: true } } },
    orderBy: [{ enrolment: { student: { rollNo: "asc" } } }, { enrolment: { course: { code: "asc" } } }],
  });
  const all = await db.eligibility.groupBy({ by: ["status"], where: { examId }, _count: { _all: true } });
  const count = (s: string) => all.find((a) => a.status === s)?._count._all ?? 0;
  const total = all.reduce((a, b) => a + b._count._all, 0);
  const lastRun = await db.auditLog.findFirst({ where: { action: "RUN_ELIGIBILITY", entityId: examId }, orderBy: { id: "desc" }, include: { actor: true } });
  const batches = await db.batch.findMany({ orderBy: { code: "asc" } });
  const canRun = ["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF"].includes(role);
  const canFile = ["ADMIN", "COE", "ACADEMIC_STAFF"].includes(role);
  const pendingReq = await db.relaxationRequest.findMany({ where: { examId, status: "PENDING" }, select: { enrolmentId: true } });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {lastRun ? <>Last computed {formatDate(lastRun.at, true)} by {lastRun.actor?.name}, using the active attendance rule of each programme.</> : "Eligibility has not been computed for this examination yet."}
        </p>
        {canRun && <EligibilityControls examId={examId} />}
      </div>

      {total > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Eligible" value={count("ELIGIBLE")} tone="green" hint={`of ${total} course registrations`} />
          <Stat label="Ineligible" value={count("INELIGIBLE")} tone="red" hint="Blocked from exam registration" />
          <Stat label="Pending relaxation" value={count("PENDING_RELAXATION")} tone="amber" hint="Awaiting Vice-Chancellor" />
          <Stat label="Relaxed" value={count("RELAXED")} tone="brand" hint="Approved by competent authority" />
        </div>
      )}

      {total === 0 ? (
        <Callout tone="amber" title="Next step">Run the eligibility check to evaluate every student&apos;s course-wise attendance against the configured rules.</Callout>
      ) : (
        <Card>
          <form className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <input type="hidden" name="tab" value="eligibility" />
            <select name="status" defaultValue={status} className="h-9 rounded-md border border-border px-3 text-sm">
              <option value="">All statuses</option>
              <option value="INELIGIBLE">Ineligible</option>
              <option value="PENDING_RELAXATION">Pending relaxation</option>
              <option value="RELAXED">Relaxed</option>
              <option value="ELIGIBLE">Eligible</option>
            </select>
            <select name="batch" defaultValue={batch} className="h-9 rounded-md border border-border px-3 text-sm">
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.code}>{b.name}</option>
              ))}
            </select>
            <button className="h-9 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Filter</button>
            <span className="ml-auto text-sm text-muted-foreground">{rows.length} rows</span>
          </form>
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Course</TH>
                <TH className="text-right">Course %</TH>
                <TH className="text-right">Aggregate %</TH>
                <TH>Decision</TH>
                <TH>Reason</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-medium">{r.enrolment.student.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.enrolment.student.rollNo}</div>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs">{r.enrolment.course.code}</span>
                    <div className="max-w-56 truncate text-xs text-muted-foreground">{r.enrolment.course.title}</div>
                  </TD>
                  <TD className={cn("text-right font-medium", r.status === "INELIGIBLE" && "text-red-700")}>{r.coursePct.toFixed(2)}</TD>
                  <TD className="text-right">{r.aggregatePct.toFixed(2)}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{r.status.replace("_", " ")}</Badge>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">rule v{r.ruleVersion}</div>
                  </TD>
                  <TD className="max-w-sm text-xs text-muted-foreground">{r.reason}</TD>
                  <TD className="text-right">
                    {canFile && r.status === "INELIGIBLE" && r.relaxable && !pendingReq.some((p) => p.enrolmentId === r.enrolmentId) && (
                      <RelaxationButton examId={examId} enrolmentId={r.enrolmentId} student={r.enrolment.student.name} course={r.enrolment.course.code} />
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
