"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { resetDemoAction } from "./actions";

export function ResetDemoButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Reset all demo data to the initial storyline? This signs everyone out.")) return;
        start(async () => {
          await resetDemoAction();
          toast.success("Demo data reset");
        });
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" /> {pending ? "Resetting…" : "Reset demo data"}
    </Button>
  );
}
