"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select } from "@/components/ui";
import { planExamAction } from "./[id]/timetable/actions";

export function PlanExamForm() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: "", name: "", parity: "EVEN", academicYear: "2026-27", from: "", to: "", fee: 1500 });
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-4 w-4" /> Plan an examination
      </Button>
    );
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="grid w-full gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="pe-code">Code</Label>
        <Input id="pe-code" placeholder="SPL-2027" value={f.code} onChange={(e) => set("code", e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-3">
        <Label htmlFor="pe-name">Name</Label>
        <Input id="pe-name" placeholder="Special Examination, 2026-27" value={f.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pe-parity">Semester</Label>
        <Select id="pe-parity" value={f.parity} onChange={(e) => set("parity", e.target.value)}>
          <option value="ODD">Odd</option>
          <option value="EVEN">Even</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="pe-ay">Academic year</Label>
        <Input id="pe-ay" value={f.academicYear} onChange={(e) => set("academicYear", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pe-from">Window from</Label>
        <Input id="pe-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pe-to">to</Label>
        <Input id="pe-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-4">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await planExamAction(f);
              if (r.error) return void toast.error(r.error);
              toast.success("Examination planned — now generate its timetable");
              if ("id" in r) router.push(`/exams/${r.id}/timetable`);
            })
          }
        >
          Create
        </Button>
      </div>
    </div>
  );
}
