"use client";

import { useState, useTransition } from "react";
import { Check, LockKeyhole, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Textarea } from "@/components/ui";
import { moderateAction, releaseAction, sealAction } from "../actions";

type Result = { ok?: boolean; error?: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, success: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(success);
    });
  return { pending, run };
}

export function ModerationPanel({ id, hasWarnings }: { id: string; hasWarnings: boolean }) {
  const [note, setNote] = useState("");
  const { pending, run } = useRun();
  return (
    <div className="space-y-3 p-4 sm:px-5">
      <Textarea rows={3} placeholder={hasWarnings ? "Comment on the flagged checks, or tell the setter what to change" : "Moderator's comments (required when returning the paper)"} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="success" disabled={pending} onClick={() => run(() => moderateAction(id, "APPROVED", note), "Paper approved — sent to the Controller for sealing")}>
          <Check className="h-4 w-4" /> Approve paper
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(() => moderateAction(id, "CHANGES_REQUESTED", note), "Returned to the setter with your comments")}>
          <Undo2 className="h-4 w-4" /> Return for changes
        </Button>
      </div>
    </div>
  );
}

export function SealButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button disabled={pending} onClick={() => run(() => sealAction(id), "Paper sealed — content locked and fingerprinted")}>
      <LockKeyhole className="h-4 w-4" /> Seal paper
    </Button>
  );
}

export function ReleaseButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button variant="success" disabled={pending} onClick={() => run(() => releaseAction(id), "Released for printing — fingerprint verified")}>
      <Printer className="h-4 w-4" /> Release for printing
    </Button>
  );
}
