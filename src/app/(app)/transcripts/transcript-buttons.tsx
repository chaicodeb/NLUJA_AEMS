"use client";

import { useState, useTransition } from "react";
import { FileText, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { issueOfficialTranscriptAction, requestStudentCopyAction } from "./actions";

export function StudentCopyButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await requestStudentCopyAction();
          if ("error" in r && r.error) return void toast.error(r.error);
          if ("docId" in r) Object.assign(document.createElement("a"), { href: `/api/transcript/${r.docId}` }).click();
        })
      }
    >
      <FileText className="h-4 w-4" /> {pending ? "Generating…" : "Download student copy"}
    </Button>
  );
}

export function IssueOfficialForm({ studentId }: { studentId: string }) {
  const [purpose, setPurpose] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-sm" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose / addressee, e.g. Higher studies — NUS Singapore" />
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await issueOfficialTranscriptAction(studentId, purpose);
            if ("error" in r && r.error) return void toast.error(r.error);
            toast.success(`Official transcript ${"verifyCode" in r ? r.verifyCode : ""} issued`);
            setPurpose("");
          })
        }
      >
        <Stamp className="h-4 w-4" /> {pending ? "Issuing…" : "Issue official transcript"}
      </Button>
    </div>
  );
}
