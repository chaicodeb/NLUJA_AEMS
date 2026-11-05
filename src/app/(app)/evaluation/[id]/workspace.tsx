"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, EyeOff, Lock, MessageSquare, MousePointer2, Save, ShieldCheck, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Callout, Card, CardBody, CardHeader, Input, Textarea } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import type { Annotation, EvaluationMarks } from "@/lib/exams/evaluation";
import { BookletPage } from "./booklet-page";
import { saveEvaluationAction } from "./actions";

type Props = {
  evaluation: { id: string; round: number; status: string; total: number | null; remarks: string; signatureHash: string | null; submittedAt: string | null; marks: EvaluationMarks };
  script: {
    dummyNo: string; barcode: string; pageCount: number; barcodeSvg: string; courseCode: string; courseTitle: string; examName: string;
    maxMarks: number; scheme: { q: string; max: number }[]; answers: string[][]; evaluationMode: string;
  };
  nextId: string | null;
};

export function Workspace({ evaluation, script, nextId }: Props) {
  const router = useRouter();
  const locked = evaluation.status === "LOCKED";
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<"none" | "tick" | "cross" | "comment">("none");
  const [questions, setQuestions] = useState<Record<string, string>>(
    Object.fromEntries(script.scheme.map((q) => [q.q, evaluation.marks.questions[q.q]?.toString() ?? ""])),
  );
  const [annotations, setAnnotations] = useState<Annotation[]>(evaluation.marks.annotations ?? []);
  const [remarks, setRemarks] = useState(evaluation.remarks);
  const [pending, start] = useTransition();

  const numeric = useMemo(() => Object.fromEntries(Object.entries(questions).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])), [questions]);
  const total = script.scheme.reduce((a, q) => a + (numeric[q.q] ?? 0), 0);
  const filled = script.scheme.filter((q) => questions[q.q] !== "").length;
  const errors = script.scheme.filter((q) => questions[q.q] !== "" && (Number(questions[q.q]) > q.max || Number(questions[q.q]) < 0 || Number.isNaN(Number(questions[q.q]))));

  const place = (x: number, y: number) => {
    if (locked || tool === "none") return;
    if (tool === "comment") {
      const text = prompt("Comment");
      if (!text) return;
      setAnnotations((a) => [...a, { page, x, y, kind: "comment", text }]);
    } else setAnnotations((a) => [...a, { page, x, y, kind: tool }]);
  };

  const save = (final: boolean) =>
    start(async () => {
      if (final && !confirm(`Submit ${total}/${script.maxMarks} for ${script.dummyNo}? The evaluation will be digitally signed and locked.`)) return;
      const res = await saveEvaluationAction(evaluation.id, { questions: numeric, annotations }, remarks, final);
      if ("error" in res && res.error) return void toast.error(res.error);
      if (final) {
        toast.success(
          res.state === "FINALISED" ? "Locked and signed — script finalised and marks posted to Result Processing"
            : res.state === "THIRD_EVALUATION" ? "Locked — evaluator disagreement exceeds threshold; third evaluation triggered"
            : "Locked and signed — awaiting the independent second evaluation",
        );
        if (nextId) router.push(`/evaluation/${nextId}`);
      } else toast.success("Draft saved");
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <div className="flex items-center gap-1">
            {[
              { k: "none", icon: MousePointer2, label: "Select" },
              { k: "tick", icon: Check, label: "Tick" },
              { k: "cross", icon: X, label: "Cross" },
              { k: "comment", icon: MessageSquare, label: "Comment" },
            ].map(({ k, icon: Icon, label }) => (
              <button
                key={k}
                disabled={locked}
                title={label}
                onClick={() => setTool(k as typeof tool)}
                className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-40", tool === k ? "bg-brand-600 text-white" : "hover:bg-muted")}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
            {annotations.length > 0 && !locked && (
              <button className="ml-1 text-xs text-muted-foreground hover:text-red-600" onClick={() => setAnnotations((a) => a.filter((x) => x.page !== page))}>
                Clear page
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <button className="rounded p-1.5 hover:bg-muted" onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}><ZoomOut className="h-4 w-4" /></button>
            <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button className="rounded p-1.5 hover:bg-muted" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}><ZoomIn className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-[84px_1fr]">
          <div className="max-h-[78vh] space-y-2 overflow-y-auto border-r border-border bg-muted/40 p-2">
            {Array.from({ length: script.pageCount }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setPage(n)} className={cn("block w-full rounded p-0.5 ring-2", n === page ? "ring-brand-500" : "ring-transparent hover:ring-border")}>
                <div className="pointer-events-none">
                  <BookletPage page={n} {...script} questionMarks={numeric} annotations={annotations} />
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{n === 1 ? "Cover" : `Page ${n}`}</div>
              </button>
            ))}
          </div>
          <div className={cn("max-h-[78vh] overflow-auto bg-neutral-200/70 p-6", tool !== "none" && !locked && "cursor-crosshair")}>
            <div style={{ width: `${zoom * 100}%`, maxWidth: zoom * 760 }} className="mx-auto">
              <BookletPage page={page} {...script} questionMarks={numeric} annotations={annotations} onPlace={place} />
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={<span className="font-mono">{script.dummyNo}</span>}
            description={`${script.courseCode} · ${script.courseTitle}`}
            action={<Badge tone={locked ? "green" : evaluation.status === "IN_PROGRESS" ? "blue" : "amber"}>{locked ? "Locked" : evaluation.status.replace("_", " ")}</Badge>}
          />
          <CardBody className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><EyeOff className="h-3.5 w-3.5" /> Candidate identity masked · barcode {script.barcode}</div>
            {script.evaluationMode !== "SINGLE" && (
              <div className="flex items-center gap-1.5 text-violet-700">
                <ShieldCheck className="h-3.5 w-3.5" /> Blind {script.evaluationMode.toLowerCase()} evaluation — round {evaluation.round}. Other evaluators&apos; marks are not visible to you.
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Marks" description="Question-wise entry; the total is computed automatically" />
          <CardBody className="space-y-2">
            {script.scheme.map((q, i) => {
              const bad = errors.some((e) => e.q === q.q);
              return (
                <div key={q.q} className="flex items-center gap-3">
                  <button className="w-12 text-left text-sm font-medium text-brand-700 hover:underline" onClick={() => setPage(i + 2)}>{q.q}</button>
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    max={q.max}
                    disabled={locked}
                    value={questions[q.q]}
                    onChange={(e) => setQuestions((s) => ({ ...s, [q.q]: e.target.value }))}
                    className={cn("w-24 text-right", bad && "border-red-400 ring-2 ring-red-100")}
                  />
                  <span className="text-sm text-muted-foreground">/ {q.max}</span>
                </div>
              );
            })}
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">{filled}/{script.scheme.length} answered</span>
              <span className="text-2xl font-semibold">
                {total}<span className="text-base text-muted-foreground"> / {script.maxMarks}</span>
              </span>
            </div>
            {errors.length > 0 && <Callout tone="red">{errors.map((e) => `${e.q} exceeds ${e.max}`).join("; ")}</Callout>}
            <Textarea rows={2} placeholder="Remarks (optional)" disabled={locked} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            {locked ? (
              <Callout tone="green" title="Digitally signed & locked">
                <div className="space-y-0.5 text-xs">
                  <div>Submitted {evaluation.submittedAt && formatDate(evaluation.submittedAt, true)}</div>
                  <div className="break-all font-mono">Signature {evaluation.signatureHash?.slice(0, 32)}…</div>
                  <div>Changes require a logged override by the Controller of Examinations.</div>
                </div>
              </Callout>
            ) : (
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" disabled={pending} onClick={() => save(false)}>
                  <Save className="h-4 w-4" /> Save draft
                </Button>
                <Button className="flex-1" disabled={pending || errors.length > 0 || filled < script.scheme.length} onClick={() => save(true)}>
                  <Lock className="h-4 w-4" /> Submit & lock
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
