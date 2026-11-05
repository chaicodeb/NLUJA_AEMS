"use client";

import { useTransition } from "react";
import { Armchair, FileBadge, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { bulkRegisterAction, generateSeatingAction, publishAdmitCardsAction } from "./actions";

export function BulkRegisterButton({ examId }: { examId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await bulkRegisterAction(examId);
          toast.success(`${r.students} students registered for their eligible papers`);
        })
      }
    >
      <UsersRound className="h-4 w-4" /> {pending ? "Registering…" : "Simulate student registrations"}
    </Button>
  );
}

export function GenerateSeatingButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="accent"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const r = await generateSeatingAction(examId);
          if ("error" in r) toast.error(r.error);
          else toast.success(`Seated ${r.seated} candidate-papers across ${r.sessions} sessions · ${r.adjacentConflicts} same-paper adjacencies`);
        })
      }
    >
      <Armchair className="h-4 w-4" /> {pending ? "Allocating seats…" : "Generate seating plan"}
    </Button>
  );
}

export function PublishAdmitCardsButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="success"
      disabled={pending || disabled}
      onClick={() => {
        if (!confirm("Publish admit cards to all registered candidates? Registration will close.")) return;
        start(async () => {
          const r = await publishAdmitCardsAction(examId);
          if ("error" in r) toast.error(r.error);
          else toast.success(`${r.issued} digitally signed admit cards published`);
        });
      }}
    >
      <FileBadge className="h-4 w-4" /> {pending ? "Publishing…" : "Publish admit cards"}
    </Button>
  );
}
