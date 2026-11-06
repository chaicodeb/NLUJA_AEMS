"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, FileDown, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Input, Label, Select, Textarea, buttonVariants } from "@/components/ui";
import { QuestionPaperView } from "@/components/question-paper-view";
import { UNITS, blocking, runChecks, type QPCheckContext, type QPContent } from "@/lib/exams/question-paper-checks";
import { ChecksList } from "./checks-list";
import { saveDraftAction } from "../actions";

type Header = React.ComponentProps<typeof QuestionPaperView>["header"];

export function Editor({ id, initial, ctx, header, version }: { id: string; initial: QPContent; ctx: QPCheckContext; header: Header; version: number }) {
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const checks = useMemo(() => runChecks(content, ctx), [content, ctx]);
  const fails = blocking(checks).length;
  const dirty = JSON.stringify(content) !== saved;

  const setQ = (i: number, patch: Partial<QPContent["questions"][number]>) =>
    setContent((c) => ({ ...c, questions: c.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) }));
  const renumber = (qs: QPContent["questions"]) => qs.map((q, k) => ({ ...q, no: `Q${k + 1}` }));
  const total = content.questions.reduce((a, q) => a + (Number.isFinite(q.marks) ? q.marks : 0), 0);

  const save = (submit: boolean) =>
    start(async () => {
      const res = await saveDraftAction(id, content, submit);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setSaved(JSON.stringify(content));
      toast.success(submit ? "Submitted to the moderator" : "Draft saved — encrypted and logged");
    });

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader title="Instructions to candidates" />
          <div className="p-4 sm:p-5">
            <Textarea rows={3} value={content.instructions} onChange={(e) => setContent((c) => ({ ...c, instructions: e.target.value }))} />
          </div>
        </Card>
        {content.questions.map((q, i) => (
          <Card key={i}>
            <CardHeader
              title={q.no}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Select aria-label={`${q.no} unit`} value={q.unit} onChange={(e) => setQ(i, { unit: e.target.value })} className="h-8 w-28 text-xs">
                    {UNITS.map((u) => <option key={u} value={u}>Unit {u}</option>)}
                  </Select>
                  <div className="flex items-center gap-1">
                    <Input aria-label={`${q.no} marks`} type="number" min={0.5} step={0.5} value={Number.isFinite(q.marks) ? q.marks : ""} onChange={(e) => setQ(i, { marks: e.target.valueAsNumber })} className="h-8 w-20 text-xs" />
                    <span className="text-xs text-muted-foreground">marks</span>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${q.no}`} disabled={content.questions.length <= 1} onClick={() => setContent((c) => ({ ...c, questions: renumber(c.questions.filter((_, k) => k !== i)) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              }
            />
            <div className="space-y-3 p-4 sm:p-5">
              <div>
                <Label>{q.orText !== undefined ? "(a)" : "Question"}</Label>
                <Textarea rows={3} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Write the question as it should appear on the paper" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={q.orText !== undefined} onChange={(e) => setQ(i, { orText: e.target.checked ? "" : undefined })} />
                Internal choice — candidate answers (a) OR (b)
              </label>
              {q.orText !== undefined && (
                <div>
                  <Label>(b)</Label>
                  <Textarea rows={3} value={q.orText} onChange={(e) => setQ(i, { orText: e.target.value })} placeholder="Alternative question of the same weight" />
                </div>
              )}
            </div>
          </Card>
        ))}
        <Button variant="outline" onClick={() => setContent((c) => ({ ...c, questions: renumber([...c.questions, { no: "", unit: "I", marks: 5, text: "" }]) }))}>
          <Plus className="h-4 w-4" /> Add question
        </Button>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <div className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader title="Automatic checks" description={`Run live as you type · ${total} / ${ctx.maxMarks} marks`} />
            <ChecksList checks={checks} />
            <div className="flex flex-wrap gap-2 border-t border-border p-4 sm:px-5">
              <Button variant="outline" disabled={pending || !dirty} onClick={() => save(false)}>
                <Save className="h-4 w-4" /> {dirty ? "Save draft" : "Saved"}
              </Button>
              <Button disabled={pending || fails > 0} onClick={() => save(true)} title={fails ? "Fix the failing checks first" : undefined}>
                <Send className="h-4 w-4" /> Submit for moderation
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Test it without publishing" description="Nothing here is visible to students" />
            <div className="flex flex-wrap gap-2 p-4 sm:px-5">
              <Button variant="outline" onClick={() => setPreview((v) => !v)}>
                <Eye className="h-4 w-4" /> {preview ? "Hide" : "Show"} candidate&apos;s view
              </Button>
              <a
                href={`/api/question-papers/${id}/pdf`}
                target="_blank"
                rel="noreferrer"
                aria-disabled={dirty}
                className={buttonVariants({ variant: "outline", className: dirty ? "pointer-events-none opacity-50" : "" })}
              >
                <FileDown className="h-4 w-4" /> Draft PDF (watermarked)
              </a>
              {dirty && <p className="w-full text-xs text-muted-foreground">Save the draft to preview it as a PDF.</p>}
            </div>
          </Card>
        </div>
      </div>

      {preview && (
        <div className="lg:col-span-5">
          <QuestionPaperView content={content} header={header} watermark={`DRAFT v${version} — NOT FOR DISTRIBUTION`} />
        </div>
      )}
    </div>
  );
}
