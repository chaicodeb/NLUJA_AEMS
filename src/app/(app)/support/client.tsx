"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LifeBuoy, RotateCcw, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { closeOrReopenAction, raiseTicketAction, replyTicketAction, updateTicketAction } from "./actions";

type Opt = [string, string];

export function RaiseTicketForm({ categories, priorities, page, defaultCategory }: { categories: Opt[]; priorities: Opt[]; page?: string; defaultCategory?: string }) {
  const [f, setF] = useState({ subject: "", category: defaultCategory ?? categories[0][0], priority: "MEDIUM", body: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="tk-subject">In a few words</Label>
          <Input id="tk-subject" placeholder="e.g. Admit card shows the wrong centre" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-cat">About</Label>
          <Select id="tk-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-pri">How urgent</Label>
          <Select id="tk-pri" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {priorities.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tk-body">What happened, and what did you expect?</Label>
        <Textarea id="tk-body" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </div>
      <div className="flex items-center justify-end gap-3">
        {page && <span className="text-xs text-muted-foreground">Raised from {page}</span>}
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await raiseTicketAction({ ...f, page });
              if (r.error) return void toast.error(r.error);
              if ("number" in r) toast.success(`Ticket HD-${r.number} raised — you can follow it here`);
              if ("id" in r) router.push(`/support/${r.id}`);
            })
          }
        >
          <LifeBuoy className="h-4 w-4" /> Raise ticket
        </Button>
      </div>
    </div>
  );
}

export function ReplyBox({ id, agent, closed }: { id: string; agent: boolean; closed: boolean }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, start] = useTransition();
  if (closed) return <p className="text-sm text-muted-foreground">This ticket is closed. Raise a new ticket if you need more help.</p>;
  return (
    <div className="space-y-2">
      <Textarea rows={3} placeholder={agent ? "Reply to the user, or add an internal note" : "Add a reply"} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" className={internal ? "border-amber-300 bg-amber-50" : ""} />
      <div className="flex items-center justify-between gap-3">
        {agent ? (
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (not shown to the user)
          </label>
        ) : (
          <span />
        )}
        <Button
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              const r = await replyTicketAction(id, body, internal);
              if (r.error) return void toast.error(r.error);
              setBody("");
              toast.success(internal ? "Internal note added" : "Reply sent");
            })
          }
        >
          <Send className="h-4 w-4" /> {internal ? "Add note" : "Send"}
        </Button>
      </div>
    </div>
  );
}

export function AgentControls({ id, status, priority, assignedToId, statuses, priorities, agents }: { id: string; status: string; priority: string; assignedToId: string | null; statuses: Opt[]; priorities: Opt[]; agents: Opt[] }) {
  const [pending, start] = useTransition();
  const change = (c: { status?: string; priority?: string; assignedToId?: string | null }, msg: string) =>
    start(async () => {
      const r = await updateTicketAction(id, c);
      if (r.error) toast.error(r.error);
      else toast.success(msg);
    });
  return (
    <div className="grid gap-3">
      <div className="space-y-1">
        <Label htmlFor="ag-status">Status</Label>
        <Select id="ag-status" value={status} disabled={pending || status === "CLOSED"} onChange={(e) => change({ status: e.target.value }, "Status updated")}>
          {statuses.filter(([k]) => k !== "CLOSED" || status === "CLOSED").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ag-pri">Priority</Label>
        <Select id="ag-pri" value={priority} disabled={pending} onChange={(e) => change({ priority: e.target.value }, "Priority changed — SLA targets recalculated")}>
          {priorities.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ag-assign">Assigned to</Label>
        <Select id="ag-assign" value={assignedToId ?? ""} disabled={pending} onChange={(e) => change({ assignedToId: e.target.value || null }, "Ticket reassigned")}>
          <option value="">Unassigned</option>
          {agents.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
    </div>
  );
}

export function CloseOrReopen({ id }: { id: string }) {
  const [rating, setRating] = useState(0);
  const [pending, start] = useTransition();
  const run = (action: "CLOSE" | "REOPEN") =>
    start(async () => {
      const r = await closeOrReopenAction(id, action, rating || null);
      if (r.error) toast.error(r.error);
      else toast.success(action === "CLOSE" ? "Thank you — ticket closed" : "Ticket reopened");
    });
  return (
    <div className="space-y-3">
      <div className="text-sm">Is your problem solved? Rate the help you received:</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} className="p-0.5">
            <Star className={`h-6 w-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" disabled={pending || !rating} onClick={() => run("CLOSE")}>
          <CheckCircle2 className="h-4 w-4" /> Yes, close it
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run("REOPEN")}>
          <RotateCcw className="h-4 w-4" /> No, reopen
        </Button>
      </div>
    </div>
  );
}
