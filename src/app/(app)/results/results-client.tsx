"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Calculator, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { approveRunAction, processResultsAction, publishRunAction } from "./actions";

export function ProcessButton({ examId, disabled }: { examId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="accent"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const r = await processResultsAction(examId);
          if ("error" in r) return void toast.error(r.error);
          toast.success(`Processed ${r.summary.students} students: ${r.summary.pass} pass, ${r.summary.fail} with backlog, ${r.summary.withheld} withheld`);
          router.push(`/results/${r.runId}`);
        })
      }
    >
      <Calculator className="h-4 w-4" /> {pending ? "Applying rules…" : "Process results"}
    </Button>
  );
}

export function ApproveButton({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="success"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await approveRunAction(runId);
          if ("error" in r && r.error) toast.error(r.error);
          else toast.success("Results verified and approved for publication");
        })
      }
    >
      <BadgeCheck className="h-4 w-4" /> {pending ? "Approving…" : "Verify & approve"}
    </Button>
  );
}

export function PublishButton({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => {
        if (!confirm("Publish results? Grade sheets will be issued and students notified.")) return;
        start(async () => {
          const r = await publishRunAction(runId);
          if ("error" in r && r.error) toast.error(r.error);
          else toast.success(`Results published — ${"issued" in r ? r.issued : 0} digitally signed grade sheets issued`);
        });
      }}
    >
      <Megaphone className="h-4 w-4" /> {pending ? "Publishing…" : "Publish results"}
    </Button>
  );
}
