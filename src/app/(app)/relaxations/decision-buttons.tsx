"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { decideRelaxationAction } from "./actions";

export function DecisionButtons({ id, canDecide }: { id: string; canDecide: boolean }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const decide = (d: "APPROVED" | "REJECTED") =>
    start(async () => {
      const res = await decideRelaxationAction(id, d, note);
      if ("error" in res && res.error) toast.error(res.error);
      else toast.success(d === "APPROVED" ? "Relaxation approved — student is now eligible for this paper" : "Relaxation rejected");
    });
  if (!canDecide) return <span className="text-xs text-muted-foreground">Awaiting Vice-Chancellor</span>;
  return (
    <div className="w-72 space-y-2">
      <Input placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" variant="success" className="flex-1" disabled={pending} onClick={() => decide("APPROVED")}>
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => decide("REJECTED")}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>
    </div>
  );
}
