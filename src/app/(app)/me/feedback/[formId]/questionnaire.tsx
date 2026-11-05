"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LIKERT, type Answers, type Question } from "@/lib/feedback/shared";
import { submitFeedbackAction } from "../../../feedback/actions";

export function FeedbackQuestionnaire({ formId, courseId, questions }: { formId: string; courseId: string; questions: Question[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [pending, start] = useTransition();
  const sections = [...new Set(questions.map((q) => q.section))];
  const missing = questions.filter((q) => q.kind === "LIKERT" && q.required && typeof answers[q.id] !== "number").length;

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Card key={section}>
          <CardHeader title={section} />
          <div className="divide-y divide-border">
            {questions.filter((q) => q.section === section).map((q) => (
              <div key={q.id} className="space-y-2 px-5 py-4">
                <div className="text-sm font-medium">{q.text}{q.required && q.kind === "LIKERT" && <span className="text-red-600"> *</span>}</div>
                {q.kind === "LIKERT" ? (
                  <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={q.text}>
                    {LIKERT.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        role="radio"
                        aria-checked={answers[q.id] === l.value}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: l.value }))}
                        className={cn(
                          "rounded-md border px-1 py-2 text-center text-xs transition",
                          answers[q.id] === l.value ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-white hover:bg-muted",
                        )}
                      >
                        <div className="text-base font-semibold">{l.value}</div>
                        <div className="hidden sm:block">{l.label}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Textarea rows={2} maxLength={1000} placeholder="Optional" value={(answers[q.id] as string) ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{missing ? `${missing} rating(s) remaining` : "All ratings answered"}</span>
        <Button
          disabled={pending || missing > 0}
          onClick={() =>
            start(async () => {
              const r = await submitFeedbackAction(formId, courseId, answers);
              if ("error" in r && r.error) toast.error(r.error);
              else {
                toast.success("Thank you — your anonymous feedback has been recorded");
                router.push("/me/feedback");
              }
            })
          }
        >
          <Send className="h-4 w-4" /> Submit anonymously
        </Button>
      </div>
    </div>
  );
}
