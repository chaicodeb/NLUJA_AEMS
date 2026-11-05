"use client";

import { useState, useTransition } from "react";
import { FileBadge, Lock, Send, Signature } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Select } from "@/components/ui";
import { applyForDegreeAction, clearDuesAction, conferDegreesAction, freezeListAction, provisionalAction } from "./actions";

export function ClearDuesButton({ studentId, department, label }: { studentId: string; department: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(true)}>
        Record payment
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Input className="h-7 w-28 text-xs" placeholder="Receipt no." value={receipt} onChange={(e) => setReceipt(e.target.value)} aria-label={`${label} receipt number`} />
      <Button
        size="sm"
        disabled={pending || receipt.trim().length < 3}
        onClick={() =>
          start(async () => {
            const r = await clearDuesAction(studentId, department, receipt);
            if ("error" in r && r.error) toast.error(r.error);
            else toast.success(`${label} dues cleared`);
          })
        }
      >
        Clear
      </Button>
    </span>
  );
}

export function FreezeListForm({ convocationId }: { convocationId: string }) {
  const [resolution, setResolution] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-9 w-80" placeholder="Academic Council resolution, e.g. AC/2026/41 dated 10.12.2026" value={resolution} onChange={(e) => setResolution(e.target.value)} />
      <Button
        disabled={pending || resolution.trim().length < 5}
        onClick={() =>
          start(async () => {
            const r = await freezeListAction(convocationId, resolution);
            if ("error" in r && r.error) toast.error(r.error);
            else if ("approved" in r) toast.success(`Graduand list frozen — ${r.approved} approved, ${r.rejected} not eligible; serial numbers allotted`);
          })
        }
      >
        <Lock className="h-4 w-4" /> Freeze graduand list
      </Button>
    </div>
  );
}

export function ConferButton({ convocationId, count }: { convocationId: string; count: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="success"
      disabled={pending || count === 0}
      onClick={() =>
        start(async () => {
          const r = await conferDegreesAction(convocationId);
          if ("error" in r && r.error) toast.error(r.error);
          else if ("issued" in r) toast.success(`${r.issued} degree certificates digitally signed and issued`);
        })
      }
    >
      <Signature className="h-4 w-4" /> {pending ? "Signing…" : `Confer ${count} degree${count === 1 ? "" : "s"}`}
    </Button>
  );
}

export function DegreeApplicationForm({ feeInPerson, feeInAbsentia }: { feeInPerson: number; feeInAbsentia: number }) {
  const [mode, setMode] = useState("IN_PERSON");
  const [guests, setGuests] = useState(2);
  const [method, setMethod] = useState("UPI");
  const [pending, start] = useTransition();
  const fee = mode === "IN_PERSON" ? feeInPerson : feeInAbsentia;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Attendance">
        <option value="IN_PERSON">Receive in person</option>
        <option value="IN_ABSENTIA">In absentia (by post / DigiLocker)</option>
      </Select>
      <Select value={guests} disabled={mode !== "IN_PERSON"} onChange={(e) => setGuests(Number(e.target.value))} aria-label="Guest passes">
        {[0, 1, 2].map((g) => <option key={g} value={g}>{g} guest pass{g === 1 ? "" : "es"}</option>)}
      </Select>
      <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
        <option value="UPI">Pay by UPI</option>
        <option value="NETBANKING">Net banking</option>
        <option value="CARD">Debit / credit card</option>
      </Select>
      <div className="flex items-center justify-end gap-3 sm:col-span-3">
        <span className="text-sm text-muted-foreground">Convocation fee ₹{fee}</span>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await applyForDegreeAction(mode, guests, method);
              if ("error" in r && r.error) toast.error(r.error);
              else toast.success("Application received — you will be notified when the graduand list is approved");
            })
          }
        >
          <Send className="h-4 w-4" /> Pay & apply
        </Button>
      </div>
    </div>
  );
}

export function ProvisionalButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await provisionalAction();
          if ("error" in r && r.error) toast.error(r.error);
          else if ("docId" in r) {
            const a = document.createElement("a");
            a.href = `/api/degree/${r.docId}`;
            a.target = "_blank";
            a.click();
          }
        })
      }
    >
      <FileBadge className="h-4 w-4" /> Provisional certificate
    </Button>
  );
}