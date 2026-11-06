"use client";

import { useState, useTransition } from "react";
import { Check, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { decideChangeAction, requestChangeAction } from "../../profile-requests/actions";

type Field = { key: string; label: string; approval: boolean; kind?: string };

export function ChangeRequestForm({ fields, categories }: { fields: Field[]; categories: [string, string][] }) {
  const [field, setField] = useState(fields[0].key);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const spec = fields.find((f) => f.key === field)!;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pf-field">Field</Label>
          <Select id="pf-field" value={field} onChange={(e) => { setField(e.target.value); setValue(""); }}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.approval ? " — needs approval" : ""}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-value">New value</Label>
          {spec.kind === "category" ? (
            <Select id="pf-value" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choose…</option>
              {categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          ) : (
            <Input id="pf-value" type={spec.kind === "date" ? "date" : spec.kind === "email" ? "email" : "text"} value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </div>
      </div>
      {spec.approval && (
        <div className="space-y-1">
          <Label htmlFor="pf-reason">Reason and supporting document</Label>
          <Textarea id="pf-reason" rows={2} placeholder="e.g. Name as per Class X certificate; attested copy submitted to the Academic Section" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">{spec.approval ? "Changes to identity details appear on certificates, so the Academic Section approves them." : "Contact details update immediately."}</span>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await requestChangeAction(field, value, reason);
              if (r.error) return void toast.error(r.error);
              toast.success("applied" in r && r.applied ? `${spec.label} updated` : "Request sent to the Academic Section for approval");
              setValue("");
              setReason("");
            })
          }
        >
          <Send className="h-4 w-4" /> {spec.approval ? "Request change" : "Update"}
        </Button>
      </div>
    </div>
  );
}

export function DecideRequest({ id, name }: { id: string; name: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [remark, setRemark] = useState("");
  const [pending, start] = useTransition();
  const run = (approve: boolean) =>
    start(async () => {
      const r = await decideChangeAction(id, approve, remark);
      if (r.error) toast.error(r.error);
      else toast.success(approve ? `Approved — ${name}'s record updated` : "Request rejected; the student will see your reason");
    });
  if (rejecting)
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Input className="h-8 w-64 text-xs" placeholder="Reason for rejection" value={remark} onChange={(e) => setRemark(e.target.value)} aria-label="Reason for rejection" />
        <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={pending} onClick={() => run(false)}>Reject</Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
      </div>
    );
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="success" disabled={pending} onClick={() => run(true)}>
        <Check className="h-3.5 w-3.5" /> Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
    </div>
  );
}
