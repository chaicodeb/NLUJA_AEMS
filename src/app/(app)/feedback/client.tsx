"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Play, Plus, Save, Send, Trash2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Select, Textarea } from "@/components/ui";
import type { Question } from "@/lib/feedback/shared";
import { addActionTakenAction, createFormAction, setFormStatusAction, updateQuestionsAction } from "./actions";

export function FormControls({ formId, status, released }: { formId: string; status: string; released: boolean }) {
  const [pending, start] = useTransition();
  const run = (change: "OPEN" | "CLOSED" | "RELEASE", msg: string) =>
    start(async () => {
      const r = await setFormStatusAction(formId, change);
      if ("error" in r && r.error) toast.error(r.error);
      else toast.success(msg);
    });
  if (status === "DRAFT")
    return (
      <Button size="sm" disabled={pending} onClick={() => run("OPEN", "Form opened — students are notified on their portal")}>
        <Play className="h-3.5 w-3.5" /> Open to students
      </Button>
    );
  if (status === "OPEN")
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("CLOSED", "Feedback window closed")}>
        <Lock className="h-3.5 w-3.5" /> Close window
      </Button>
    );
  if (!released)
    return (
      <Button size="sm" variant="success" disabled={pending} onClick={() => run("RELEASE", "Course-wise results released to teachers")}>
        <Unlock className="h-3.5 w-3.5" /> Release to teachers
      </Button>
    );
  return null;
}

export function NewFormButton({ academicYear }: { academicYear: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"COURSE" | "INSTITUTION">("COURSE");
  const [title, setTitle] = useState("");
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New feedback form
      </Button>
    );
  return (
    <div className="grid w-full max-w-xl gap-2 rounded-lg border border-border bg-white p-4 sm:grid-cols-2">
      <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        <option value="COURSE">Course & teacher feedback</option>
        <option value="INSTITUTION">Student satisfaction survey</option>
      </Select>
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="text-xs text-muted-foreground">Opens<Input type="date" value={opens} onChange={(e) => setOpens(e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Closes<Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={pending || !title || !opens || !closes}
          onClick={() =>
            start(async () => {
              const r = await createFormAction(type, title, academicYear, opens, closes);
              if ("error" in r && r.error) toast.error(r.error);
              else if ("id" in r) {
                toast.success("Draft created from the standard template — edit the questions, then open it");
                router.push(`/feedback/${r.id}`);
              }
            })
          }
        >
          Create draft
        </Button>
      </div>
    </div>
  );
}

export function QuestionEditor({ formId, initial }: { formId: string; initial: Question[] }) {
  const [questions, setQuestions] = useState(initial);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-2 px-5 py-4">
      {questions.map((q, i) => (
        <div key={i} className="grid items-center gap-2 sm:grid-cols-[140px_1fr_110px_auto]">
          <Input value={q.section} onChange={(e) => set(i, { section: e.target.value })} aria-label="Section" />
          <Input value={q.text} onChange={(e) => set(i, { text: e.target.value })} aria-label="Question" />
          <Select value={q.kind} onChange={(e) => set(i, { kind: e.target.value as Question["kind"], required: e.target.value === "LIKERT" })}>
            <option value="LIKERT">Rating 1–5</option>
            <option value="TEXT">Comment</option>
          </Select>
          <button type="button" className="p-1 text-muted-foreground hover:text-red-600" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label="Remove question">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex justify-between pt-2">
        <Button size="sm" variant="ghost" onClick={() => setQuestions((qs) => [...qs, { id: `n${Date.now() % 100000}`, section: qs.at(-1)?.section ?? "General", text: "", kind: "LIKERT", required: true }])}>
          <Plus className="h-3.5 w-3.5" /> Add question
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await updateQuestionsAction(formId, questions);
              if ("error" in r && r.error) toast.error(r.error);
              else toast.success("Questionnaire saved");
            })
          }
        >
          <Save className="h-3.5 w-3.5" /> Save questionnaire
        </Button>
      </div>
    </div>
  );
}

export function ActionTakenForm({ formId, courseId }: { formId: string; courseId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea rows={2} placeholder="e.g. Two additional tutorials scheduled; paper-setter briefed on syllabus coverage; reviewed in the Board of Studies on 12 Dec." value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending || note.trim().length < 10}
          onClick={() =>
            start(async () => {
              const r = await addActionTakenAction(formId, courseId, note);
              if ("error" in r && r.error) toast.error(r.error);
              else {
                toast.success("Action taken recorded for the NAAC report");
                setNote("");
              }
            })
          }
        >
          <Send className="h-3.5 w-3.5" /> Record action taken
        </Button>
      </div>
    </div>
  );
}
