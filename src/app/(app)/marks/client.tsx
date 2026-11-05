"use client";

import { useState, useTransition } from "react";
import { BellRing, Check, LockOpen, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Textarea } from "@/components/ui";
import { remindTeacherAction, reopenSheetAction, returnSheetAction, verifySheetAction } from "./actions";

export function RemindButton({ sheetId }: { sheetId: string }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending || sent}
      onClick={() =>
        start(async () => {
          const r = await remindTeacherAction(sheetId);
          if ("error" in r && r.error) toast.error(r.error);
          else {
            setSent(true);
            toast.success(`Reminder sent to ${"to" in r ? r.to : "the teacher"} by SMS and e-mail`);
          }
        })
      }
    >
      <BellRing className="h-3.5 w-3.5" /> {sent ? "Reminded" : "Remind"}
    </Button>
  );
}

export function ReviewActions({ sheetId, canReopen, status }: { sheetId: string; canReopen: boolean; status: string }) {
  const [mode, setMode] = useState<"none" | "return" | "reopen">("none");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string } | { ok: boolean }>, success: string) =>
    start(async () => {
      const r = await fn();
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success(success);
        setMode("none");
        setNote("");
      }
    });

  if (mode !== "none")
    return (
      <div className="space-y-2">
        <Textarea
          rows={2}
          placeholder={mode === "return" ? "What should the teacher correct?" : "Reason for unlocking (recorded in the audit trail)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
          <Button
            size="sm"
            variant={mode === "return" ? "default" : "accent"}
            disabled={pending || !note.trim()}
            onClick={() =>
              mode === "return"
                ? run(() => returnSheetAction(sheetId, note), "Sheet returned to the teacher")
                : run(() => reopenSheetAction(sheetId, note), "Sheet unlocked and returned to the teacher")
            }
          >
            {mode === "return" ? "Return to teacher" : "Unlock sheet"}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-wrap gap-2">
      {status === "SUBMITTED" && (
        <>
          <Button size="sm" variant="success" disabled={pending} onClick={() => run(() => verifySheetAction(sheetId), "Verified — marks locked for result processing")}>
            <Check className="h-3.5 w-3.5" /> {pending ? "Checking signature…" : "Verify & lock"}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("return")}>
            <Undo2 className="h-3.5 w-3.5" /> Return for correction
          </Button>
        </>
      )}
      {status === "VERIFIED" && canReopen && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("reopen")}>
          <LockOpen className="h-3.5 w-3.5" /> Unlock for correction
        </Button>
      )}
    </div>
  );
}
