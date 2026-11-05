"use client";

import { useState, useTransition } from "react";
import { FastForward } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { jumpStageAction } from "./actions";
import type { DemoStage } from "@/lib/demo/stages";

export function DemoStageControl({ stages }: { stages: { key: string; label: string; hint: string }[] }) {
  const [stage, setStage] = useState(stages[0].key);
  const [pending, start] = useTransition();
  const hint = stages.find((s) => s.key === stage)?.hint;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Presenter:</span>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="h-8 w-56 text-xs" disabled={pending}>
          {stages.map((s, i) => (
            <option key={s.key} value={s.key}>{i + 1}. {s.label}</option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("Rebuild the demo data at this stage? Everyone will be signed out.")) return;
            start(async () => {
              await jumpStageAction(stage as DemoStage);
            });
          }}
        >
          <FastForward className="h-3.5 w-3.5" /> {pending ? "Rebuilding…" : "Jump"}
        </Button>
      </div>
      <span className="max-w-sm text-right text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}
