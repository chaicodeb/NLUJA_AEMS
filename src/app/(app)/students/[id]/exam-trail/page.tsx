import Link from "next/link";
import { ArrowLeft, Download, FileSearch, ShieldCheck, ShieldX } from "lucide-react";
import { requirePage } from "@/lib/session";
import { PHASES, studentExamTrail, studentExams, type TrailEvent } from "@/lib/exams/trail";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

const STAGES: TrailEvent["stage"][] = ["Access", "Attendance", "Eligibility", "Registration", "Seating", "Exam hall", "Custody", "Evaluation", "Result", "Document", "Post-result"];
const TONE: Record<TrailEvent["stage"], "neutral" | "brand" | "green" | "blue" | "amber" | "red" | "violet"> = {
  Access: "neutral", Attendance: "amber", Eligibility: "amber", Registration: "blue", Seating: "blue", "Exam hall": "brand", Custody: "violet", Evaluation: "violet", Result: "green", Document: "green", "Post-result": "amber",
};

export default async function ExamTrailPage({ params, searchParams }: PageProps<"/students/[id]/exam-trail">) {
  const user = await requirePage("/students");
  const { id } = await params;
  const sp = await searchParams;
  const exams = await studentExams(id);
  if (!exams.length) return <EmptyState title="This student has not registered for an examination yet" />;
  const examId = typeof sp.exam === "string" && exams.some((e) => e.id === sp.exam) ? sp.exam : exams[0].id;
  const stage = typeof sp.stage === "string" && STAGES.includes(sp.stage as TrailEvent["stage"]) ? (sp.stage as TrailEvent["stage"]) : null;
  const t = await studentExamTrail(id, examId, { showEvaluators: ["COE", "EXAM_STAFF", "ADMIN", "VC"].includes(user.role) });
  const events = stage ? t.events.filter((e) => e.stage === stage) : t.events;
  const phases = PHASES.filter((p) => events.some((e) => e.phase === p));
  const base = `/students/${id}/exam-trail?exam=${examId}`;

  return (
    <div className="space-y-6">
      <Link href={`/students/${id}`} className="no-print inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t.student.name}
      </Link>
      <PageHeader
        eyebrow={`Examination trail · ${t.student.rollNo} · ${t.student.batch.code}`}
        title={`${t.student.name} — ${t.exam.name}`}
        description="Everything recorded about this student in this examination, phase by phase and in time order within each phase: entries from the tamper-evident audit trail merged with the operational records (eligibility, seat, hall check-in, script custody, evaluation, result, documents)."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <a href={`/api/students/${id}/exam-trail?exam=${examId}`} className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> CSV
            </a>
            <PrintButton />
            <Link href={`/audit?q=${encodeURIComponent(t.student.name)}`} className={buttonVariants({ variant: "outline" })}>
              <FileSearch className="h-4 w-4" /> In audit trail
            </Link>
          </div>
        }
      />
      {t.chain.ok ? (
        <Callout tone="green" title="Audit chain verified">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> All {t.chain.total} audit entries recomputed just now — none altered. {t.counts.audit} of them concern this student or this examination; {t.counts.records} further events come from operational records.</span>
        </Callout>
      ) : (
        <Callout tone="red" title="Audit chain broken">
          <span className="inline-flex items-center gap-1.5"><ShieldX className="h-4 w-4" /> Entry #{t.chain.brokenAt} does not match its hash — investigate before relying on this trail.</span>
        </Callout>
      )}
      <div className="no-print flex flex-wrap gap-2">
        {exams.length > 1 && exams.map((e) => (
          <Link key={e.id} href={`/students/${id}/exam-trail?exam=${e.id}`} className={`rounded-full border px-3 py-1 text-xs ${e.id === examId ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground"}`}>{e.code}</Link>
        ))}
        <span className="mx-1 hidden h-6 border-l border-border sm:block" />
        <Link href={base} className={`rounded-full border px-3 py-1 text-xs ${!stage ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground"}`}>All ({t.events.length})</Link>
        {STAGES.filter((s) => t.events.some((e) => e.stage === s)).map((s) => (
          <Link key={s} href={`${base}&stage=${encodeURIComponent(s)}`} className={`rounded-full border px-3 py-1 text-xs ${stage === s ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground"}`}>
            {s} ({t.events.filter((e) => e.stage === s).length})
          </Link>
        ))}
      </div>
      {t.fastForwarded && (
        <Callout tone="blue" title="Dates in the demo">
          This examination is scheduled from {formatDate(t.exam.startDate)}, but the demo runs it before its scheduled dates. Records such as hall attendance, script custody and evaluation therefore show the scheduled examination dates, while audit-trail entries show the actual time each action was performed in the demo (the audit trail is never back-dated). In real use, every action happens on the actual day, so both show the same date and time.
        </Callout>
      )}
      {phases.map((p) => (
        <Card key={p}>
          <CardHeader title={`${PHASES.indexOf(p) + 1}. ${p}`} />
          <ol className="divide-y divide-border">
            {events.filter((e) => e.phase === p).map((e, i) => (
              <li key={i} className={`flex gap-3 px-4 py-3 text-sm sm:px-5 ${e.scope === "exam" ? "bg-muted/30" : ""}`}>
                <div className="w-20 shrink-0 pt-0.5 text-xs leading-tight text-muted-foreground">
                  <div>{e.at.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}</div>
                  <div>{e.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={TONE[e.stage]}>{e.stage}</Badge>
                    <span className="font-medium">{e.title}</span>
                    {e.scope === "exam" && <span className="text-xs text-muted-foreground">· whole examination</span>}
                  </div>
                  <div className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">{e.detail}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {e.audit ? (
                      <span className="font-mono">Audit #{e.audit.id} · {e.audit.actor} · hash {e.audit.hash.slice(0, 12)}…</span>
                    ) : (
                      <span>Operational record</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}
