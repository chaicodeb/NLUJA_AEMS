import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR, Callout } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { EligibilityControls, RelaxationButton } from "./eligibility-client";
import { BulkRegisterButton, GenerateSeatingButton, PublishAdmitCardsButton } from "./ops-client";
import { sessionKey } from "@/lib/exams/seating";
import { THIRD_EVAL_THRESHOLD } from "@/lib/exams/evaluation";
import { ConductExamButton, EvaluatorSelect, ReopenButton } from "./scripts-client";

export const maxDuration = 300;

const TABS = [
  { key: "papers", label: "Papers & schedule" },
  { key: "eligibility", label: "Eligibility" },
  { key: "registrations", label: "Registrations" },
  { key: "seating", label: "Seating & admit cards" },
  { key: "scripts", label: "Scripts & evaluation" },
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
      {tab === "registrations" && <RegistrationsTab examId={id} role={user.role} registrationOpen={exam.registrationOpen} feeAmount={exam.feeAmount} />}
      {tab === "seating" && <SeatingTab examId={id} role={user.role} published={exam.admitCardsPublished} session={String(sp.session ?? "")} />}
      {tab === "scripts" && <ScriptsTab examId={id} role={user.role} published={exam.admitCardsPublished} paperFilter={String(sp.paper ?? "")} />}
    </div>
  );
}

const EVAL_TONE = { ASSIGNED: "amber", IN_PROGRESS: "blue", LOCKED: "green" } as const;
const SCRIPT_TONE = { ALLOCATED: "amber", FINALISED: "green", THIRD_EVALUATION: "violet" } as const;

async function ScriptsTab({ examId, role, published, paperFilter }: { examId: string; role: string; published: boolean; paperFilter: string }) {
  const papers = await db.examPaper.findMany({
    where: { examId },
    include: { course: true, setter: true, scripts: { include: { evaluations: { include: { evaluator: true } } } } },
    orderBy: [{ date: "asc" }, { session: "asc" }],
  });
  const total = papers.reduce((a, p) => a + p.scripts.length, 0);
  const canOperate = ["ADMIN", "COE", "EXAM_STAFF"].includes(role);
  const canAssign = ["ADMIN", "COE"].includes(role);

  if (total === 0) {
    return (
      <div className="space-y-4">
        <Callout tone="amber" title="Examination not yet conducted">
          After the examination, answer booklets are collected, sealed, moved to the strong room, barcoded with a dummy number (masking roll number and signature) and scanned for on-screen evaluation.
        </Callout>
        {canOperate && <ConductExamButton examId={examId} disabled={!published} />}
        {!published && <p className="text-sm text-muted-foreground">Publish admit cards first.</p>}
      </div>
    );
  }

  const scripts = papers.flatMap((p) => p.scripts.map((s) => ({ ...s, paper: p })));
  const finalised = scripts.filter((s) => s.status === "FINALISED").length;
  const evals = scripts.flatMap((s) => s.evaluations);
  const pendingEvals = evals.filter((e) => e.status !== "LOCKED").length;
  const third = scripts.filter((s) => s.status === "THIRD_EVALUATION").length;
  const absent = await db.seatAllocation.count({ where: { examPaper: { examId }, attended: false } });
  const candidates = await db.user.findMany({ where: { role: { in: ["EVALUATOR", "FACULTY"] } }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const shown = paperFilter ? scripts.filter((s) => s.paper.course.code === paperFilter) : scripts.filter((s) => s.status !== "FINALISED" || s.paper.evaluationMode === "DOUBLE").slice(0, 40);
  const custody = await db.custodyEvent.findMany({ where: { scriptId: { in: shown.map((s) => s.id) } }, orderBy: { at: "asc" } });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Scripts scanned" value={total} tone="brand" hint="300 DPI · PDF/A · identity masked" />
        <Stat label="Absent" value={absent} hint="Recorded as AB" />
        <Stat label="Finalised" value={`${finalised}/${total}`} tone="green" hint="Marks posted to Result Processing" />
        <Stat label="Pending evaluations" value={pendingEvals} tone={pendingEvals ? "amber" : "green"} />
        <Stat label="Third evaluations" value={third} tone={third ? "red" : "neutral"} hint={`Triggered when evaluators differ by > ${Math.round(THIRD_EVAL_THRESHOLD * 100)}%`} />
      </div>

      <Card>
        <CardHeader title="Evaluator allocation" description="Pending scripts can be reassigned. The system refuses to assign a paper's setter as its evaluator, or the same person to two rounds of a blind double evaluation." />
        <Table>
          <THead>
            <tr>
              <TH>Paper</TH>
              <TH>Setter</TH>
              <TH>Mode</TH>
              <TH>Round 1 evaluator</TH>
              <TH>Round 2 evaluator</TH>
              <TH className="text-right">Progress</TH>
            </tr>
          </THead>
          <tbody>
            {papers.filter((p) => p.scripts.length).map((p) => {
              const ev = p.scripts.flatMap((s) => s.evaluations);
              const r1 = ev.find((e) => e.round === 1);
              const r2 = ev.find((e) => e.round === 2);
              const done = p.scripts.filter((s) => s.status === "FINALISED").length;
              const opts = candidates.map((c) => ({ id: c.id, label: `${c.name} (${c.role === "EVALUATOR" ? "external" : "faculty"})` }));
              return (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/exams/${examId}?tab=scripts&paper=${p.course.code}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{p.course.code}</Link>
                    <div className="max-w-52 truncate text-xs text-muted-foreground">{p.course.title}</div>
                  </TD>
                  <TD className="text-xs">{p.setter?.name ?? "—"}</TD>
                  <TD><Badge tone={p.evaluationMode === "DOUBLE" ? "violet" : "neutral"}>{p.evaluationMode}</Badge></TD>
                  <TD className="w-60">{r1 && (canAssign ? <EvaluatorSelect examId={examId} examPaperId={p.id} round={1} current={r1.evaluatorId} options={opts} /> : <span className="text-xs">{r1.evaluator.name}</span>)}</TD>
                  <TD className="w-60">{r2 ? (canAssign ? <EvaluatorSelect examId={examId} examPaperId={p.id} round={2} current={r2.evaluatorId} options={opts} /> : <span className="text-xs">{r2.evaluator.name}</span>) : <span className="text-xs text-muted-foreground">—</span>}</TD>
                  <TD className="text-right text-sm">{done}/{p.scripts.length}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title={paperFilter ? `Scripts — ${paperFilter}` : "Scripts needing attention & double-evaluated scripts"}
          description="Candidate identity stays sealed here; it is decoded only during result processing."
          action={paperFilter ? <Link href={`/exams/${examId}?tab=scripts`} className="text-sm text-brand-700 hover:underline">Show summary</Link> : undefined}
        />
        <Table>
          <THead>
            <tr>
              <TH>Dummy No. / barcode</TH>
              <TH>Paper</TH>
              <TH>Chain of custody</TH>
              <TH>Evaluations</TH>
              <TH className="text-right">Final</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {shown.map((s) => (
              <TR key={s.id} className="align-top">
                <TD>
                  <div className="font-mono font-semibold">{s.dummyNo}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{s.barcode}</div>
                </TD>
                <TD className="font-mono text-xs">{s.paper.course.code}</TD>
                <TD>
                  <details>
                    <summary className="cursor-pointer text-xs text-brand-700">{custody.filter((c) => c.scriptId === s.id).length} checkpoints</summary>
                    <ol className="mt-1 space-y-0.5 border-l border-brand-200 pl-2 text-[11px]">
                      {custody.filter((c) => c.scriptId === s.id).map((c) => (
                        <li key={c.id}>
                          <span className="font-semibold">{c.action.replaceAll("_", " ")}</span> · {c.location} · {c.handler} · {formatDate(c.at, true)}
                        </li>
                      ))}
                    </ol>
                  </details>
                </TD>
                <TD>
                  <div className="space-y-1">
                    {s.evaluations.sort((a, b) => a.round - b.round).map((e) => (
                      <div key={e.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">R{e.round}</span>
                        <span>{e.evaluator.name}</span>
                        <Badge tone={EVAL_TONE[e.status as keyof typeof EVAL_TONE] ?? "neutral"}>{e.status === "LOCKED" ? `${e.total}` : e.status.replace("_", " ")}</Badge>
                        {e.status === "LOCKED" && role === "COE" && <ReopenButton examId={examId} evaluationId={e.id} />}
                      </div>
                    ))}
                  </div>
                </TD>
                <TD className="text-right font-semibold">{s.finalMarks ?? "—"}<span className="text-xs font-normal text-muted-foreground">/{s.paper.maxMarks}</span></TD>
                <TD><Badge tone={SCRIPT_TONE[s.status as keyof typeof SCRIPT_TONE] ?? "neutral"}>{s.status.replace("_", " ")}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

async function RegistrationsTab({ examId, role, registrationOpen, feeAmount }: { examId: string; role: string; registrationOpen: boolean; feeAmount: number }) {
  const regs = await db.examRegistration.findMany({
    where: { examId },
    include: { student: { include: { batch: true } }, papers: { include: { examPaper: { include: { course: true } } } } },
    orderBy: { student: { rollNo: "asc" } },
  });
  const students = await db.student.count();
  const blocked = await db.auditLog.count({ where: { action: "REGISTRATION_BLOCKED" } });
  const canOperate = ["ADMIN", "COE", "EXAM_STAFF"].includes(role);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Students register through the student portal: only papers they are eligible for can be selected, and the fee of ₹{feeAmount} is collected through the payment gateway.
        </p>
        {canOperate && registrationOpen && <BulkRegisterButton examId={examId} />}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Registered students" value={regs.length} hint={`of ${students} students`} tone="green" />
        <Stat label="Fees collected" value={`₹${(regs.filter((r) => r.feePaid).length * feeAmount).toLocaleString("en-IN")}`} hint="Reconciled with payment gateway" tone="brand" />
        <Stat label="Blocked attempts" value={blocked} hint="Ineligible papers rejected with reason" tone={blocked ? "red" : "neutral"} />
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH>Batch</TH>
              <TH>Papers</TH>
              <TH>Payment</TH>
              <TH>Submitted</TH>
              <TH>Admit card</TH>
            </tr>
          </THead>
          <tbody>
            {regs.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium">{r.student.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.student.rollNo}</div>
                </TD>
                <TD className="text-sm">{r.student.batch.name}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {r.papers.map((p) => (
                      <span key={p.id} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{p.examPaper.course.code}</span>
                    ))}
                  </div>
                </TD>
                <TD>
                  <Badge tone={r.feePaid ? "green" : "amber"}>{r.feePaid ? "Paid" : "Pending"}</Badge>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.paymentRef}</div>
                </TD>
                <TD className="text-xs">{formatDate(r.submittedAt, true)}</TD>
                <TD>
                  {r.admitCardCode ? (
                    <a href={`/api/admit-card/${r.id}`} target="_blank" className="text-sm font-medium text-brand-700 hover:underline">
                      {r.admitCardCode}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not issued</span>
                  )}
                </TD>
              </TR>
            ))}
            {regs.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">No registrations yet.</TD></TR>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

async function SeatingTab({ examId, role, published, session }: { examId: string; role: string; published: boolean; session: string }) {
  const papers = await db.examPaper.findMany({ where: { examId }, include: { course: true, _count: { select: { registrationPapers: true, seats: true } } }, orderBy: [{ date: "asc" }, { session: "asc" }] });
  const sessions = Array.from(new Map(papers.map((p) => [sessionKey(p.date, p.session), p])).entries()).map(([key, p]) => ({
    key, date: p.date, session: p.session, papers: papers.filter((x) => sessionKey(x.date, x.session) === key),
  }));
  const current = sessions.find((s) => s.key === session) ?? sessions[0];
  const seats = current
    ? await db.seatAllocation.findMany({ where: { examPaperId: { in: current.papers.map((p) => p.id) } }, include: { student: true, room: true, examPaper: { include: { course: true } } } })
    : [];
  const rooms = await db.room.findMany({ orderBy: { code: "asc" } });
  const duties = current ? await db.invigilation.findMany({ where: { examId, session: current.session, date: new Date(`${current.key.split("|")[0]}T00:00:00.000Z`) }, include: { user: true, room: true } }) : [];
  const totalSeats = await db.seatAllocation.count({ where: { examPaper: { examId } } });
  const regCount = await db.examRegistration.count({ where: { examId } });
  const canOperate = ["ADMIN", "COE", "EXAM_STAFF"].includes(role);
  const palette = ["bg-brand-100 text-brand-900 ring-brand-300", "bg-sky-100 text-sky-900 ring-sky-300", "bg-violet-100 text-violet-900 ring-violet-300"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Candidates are shuffled and laid out so that no two students writing the same paper sit next to each other. Invigilators are rotated, and a paper&apos;s setter is never assigned to invigilate that session.
        </p>
        {canOperate && (
          <div className="flex gap-2">
            <GenerateSeatingButton examId={examId} disabled={published || regCount === 0} />
            {["ADMIN", "COE"].includes(role) && <PublishAdmitCardsButton examId={examId} disabled={published || totalSeats === 0} />}
          </div>
        )}
      </div>
      {published && <Callout tone="green" title="Admit cards published">Registration is closed. Candidates can download their digitally signed admit cards from the student portal.</Callout>}
      {regCount === 0 && <Callout tone="amber">No registrations yet — seating can be generated once students have registered.</Callout>}

      <div className="flex flex-wrap gap-2">
        {sessions.map((s) => (
          <Link
            key={s.key}
            href={`/exams/${examId}?tab=seating&session=${encodeURIComponent(s.key)}`}
            className={cn("rounded-lg border px-3 py-1.5 text-xs", s.key === current?.key ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-white hover:bg-muted")}
          >
            <div className="font-semibold">{formatDate(s.date)} · {s.session}</div>
            <div className="opacity-80">{s.papers.map((p) => p.course.code).join(" + ")}</div>
          </Link>
        ))}
      </div>

      {current && seats.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {current.papers.map((p, i) => (
              <span key={p.id} className={cn("rounded px-2 py-1 ring-1 ring-inset", palette[i % palette.length])}>
                <strong>{p.course.code}</strong> {p.course.title} · {p._count.seats} seated
              </span>
            ))}
            <a href={`/exams/${examId}/sheet?session=${encodeURIComponent(current.key)}`} target="_blank" className="ml-auto font-medium text-brand-700 hover:underline">
              Print attendance sheets
            </a>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {rooms
              .filter((room) => seats.some((s) => s.roomId === room.id))
              .map((room) => {
                const duty = duties.find((d) => d.roomId === room.id);
                return (
                  <Card key={room.id}>
                    <CardHeader title={room.name} description={`${room.centre} · Invigilator: ${duty?.user.name ?? "—"}`} action={<Badge>{seats.filter((s) => s.roomId === room.id).length} / {room.rows * room.cols}</Badge>} />
                    <div className="p-4">
                      <div className="mb-2 rounded bg-muted py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Invigilator&apos;s desk</div>
                      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(0, 1fr))` }}>
                        {Array.from({ length: room.rows * room.cols }, (_, i) => {
                          const label = `${room.code}/${String.fromCharCode(65 + Math.floor(i / room.cols))}${(i % room.cols) + 1}`;
                          const s = seats.find((x) => x.roomId === room.id && x.benchNo === label);
                          const idx = s ? current.papers.findIndex((p) => p.id === s.examPaperId) : -1;
                          return (
                            <div key={label} className={cn("rounded-md px-1 py-1.5 text-center text-[10px] leading-tight ring-1 ring-inset", s ? palette[idx % palette.length] : "bg-white text-muted-foreground/50 ring-border")} title={s ? `${s.student.name} · ${s.examPaper.course.code}` : "Empty"}>
                              <div className="font-mono font-semibold">{label.split("/")[1]}</div>
                              <div className="truncate">{s ? s.student.rollNo : "—"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
          {duties.some((d) => d.duty === "FLYING_SQUAD") && (
            <p className="text-sm text-muted-foreground">Flying squad: {duties.filter((d) => d.duty === "FLYING_SQUAD").map((d) => d.user.name).join(", ")}</p>
          )}
        </>
      )}
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
