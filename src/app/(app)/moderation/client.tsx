"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Scale, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Textarea } from "@/components/ui";
import type { PaperStat } from "@/lib/results/moderation";
import { decideModerationAction, previewModerationAction, proposeModerationAction } from "./actions";

export function ProposeModeration({ examId, paperId, maxAdd, flagged, before }: { examId: string; paperId: string; maxAdd: number; flagged: boolean; before: PaperStat }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState(maxAdd);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ stat: PaperStat; newlyPassing: string[] } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || !(delta > 0)) return;
    let live = true;
    previewModerationAction(paperId, delta).then((p) => live && setPreview(p));
    return () => {
      live = false;
    };
  }, [open, delta, paperId]);

  if (!open)
    return (
      <Button size="sm" variant={flagged ? "accent" : "ghost"} onClick={() => setOpen(true)}>
        <Scale className="h-3.5 w-3.5" /> {flagged ? "Propose moderation" : "Moderate"}
      </Button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-border bg-white p-3">
      <div className="flex items-center gap-2 text-xs">
        <span>Add to every candidate</span>
        <Input type="number" step={0.5} min={0.5} max={maxAdd} className="h-8 w-20" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
        <span className="text-muted-foreground">marks (cap {maxAdd})</span>
      </div>
      {preview && (
        <div className="rounded bg-muted/50 px-2 py-1.5 text-xs">
          Pass rate {before.passPct}% → <strong>{preview.stat.passPct}%</strong> · mean {before.meanPct}% → {preview.stat.meanPct}%
          {preview.newlyPassing.length > 0 && <div className="text-muted-foreground">Would pass: {preview.newlyPassing.join(", ")}</div>}
        </div>
      )}
      <Textarea rows={2} placeholder="Moderation Board's reasoning (recorded)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={pending || reason.trim().length < 15 || !(delta > 0) || delta > maxAdd}
          onClick={() =>
            start(async () => {
              const r = await proposeModerationAction(examId, paperId, delta, reason);
              if ("error" in r && r.error) toast.error(r.error);
              else toast.success("Proposal sent to the Vice-Chancellor for approval");
            })
          }
        >
          Submit proposal
        </Button>
      </div>
    </div>
  );
}

export function DecideModeration({ actionId }: { actionId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideModerationAction(actionId, approve, note);
      if ("error" in r && r.error) toast.error(r.error);
      else toast.success(approve ? `Moderation approved — applied to ${"applied" in r ? r.applied : 0} candidates` : "Proposal rejected");
    });
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Input className="h-8 w-48 text-xs" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" variant="success" disabled={pending} onClick={() => decide(true)}>
        <Check className="h-3.5 w-3.5" /> Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
    </div>
  );
}
