"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select } from "@/components/ui";
import { EVENT_TYPES } from "@/lib/academics/calendar-shared";
import { deleteEventAction, saveEventAction } from "../academics/actions";

type EventInput = { id?: string; title: string; type: string; startDate: string; endDate: string; audience: string; description: string };
const EMPTY: EventInput = { title: "", type: "HOLIDAY", startDate: "", endDate: "", audience: "ALL", description: "" };

export function EventForm({ initial, onDone }: { initial?: EventInput; onDone?: () => void }) {
  const [open, setOpen] = useState(!!initial);
  const [f, setF] = useState<EventInput>(initial ?? EMPTY);
  const [pending, start] = useTransition();
  const set = (k: keyof EventInput, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === "startDate" && (!x.endDate || x.endDate < v) ? { endDate: v } : {}) }));
  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add to calendar
      </Button>
    );
  const close = () => {
    setOpen(false);
    setF(EMPTY);
    onDone?.();
  };
  return (
    <div className="grid w-full gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-6">
      <div className="space-y-1 sm:col-span-3">
        <Label htmlFor={`ev-title-${f.id ?? "new"}`}>Title</Label>
        <Input id={`ev-title-${f.id ?? "new"}`} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. May Day" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`ev-type-${f.id ?? "new"}`}>Type</Label>
        <Select id={`ev-type-${f.id ?? "new"}`} value={f.type} onChange={(e) => set("type", e.target.value)}>
          {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`ev-aud-${f.id ?? "new"}`}>Shown to</Label>
        <Select id={`ev-aud-${f.id ?? "new"}`} value={f.audience} onChange={(e) => set("audience", e.target.value)}>
          <option value="ALL">Everyone</option>
          <option value="STUDENTS">Students (and staff)</option>
          <option value="STAFF">Staff only</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`ev-from-${f.id ?? "new"}`}>From</Label>
        <Input id={`ev-from-${f.id ?? "new"}`} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`ev-to-${f.id ?? "new"}`}>To</Label>
        <Input id={`ev-to-${f.id ?? "new"}`} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-4">
        <Label htmlFor={`ev-desc-${f.id ?? "new"}`}>Note</Label>
        <Input id={`ev-desc-${f.id ?? "new"}`} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional" />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveEventAction(f);
              if (r.error) return void toast.error(r.error);
              if ("warning" in r && r.warning) toast.warning(r.warning, { duration: 10000 });
              else toast.success(f.id ? "Calendar updated" : "Added to the calendar");
              close();
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function EventActions({ event }: { event: EventInput & { id: string } }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing) return <EventForm initial={event} onDone={() => setEditing(false)} />;
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${event.title}`}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${event.title}`}
        onClick={() => {
          if (!window.confirm(`Remove "${event.title}" from the calendar?`)) return;
          start(async () => {
            const r = await deleteEventAction(event.id);
            if (r.error) toast.error(r.error);
            else toast.success("Removed");
          });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
