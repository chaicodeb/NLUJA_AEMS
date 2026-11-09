"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n";
import { submitExplanationAction } from "../../exams/[id]/ufm-actions";

export function ExplanationForm({ caseId }: { caseId: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Explain what happened in your own words")} aria-label={t("Your written explanation")} />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending || text.trim().length < 20}
          onClick={() =>
            start(async () => {
              const r = await submitExplanationAction(caseId, text);
              if ("error" in r && r.error) toast.error(t.loose(r.error));
              else toast.success(t("Your explanation has been sent to the committee"));
            })
          }
        >
          <Send className="h-3.5 w-3.5" /> {t("Submit explanation")}
        </Button>
      </div>
    </div>
  );
}
