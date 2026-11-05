"use client";

import { useState, useTransition } from "react";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, CardHeader, Callout } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { submitRegistrationAction } from "./actions";

type Paper = { paperId: string; code: string; title: string; date: string; session: string; status: string; reason: string; eligible: boolean };

export function RegistrationForm({ examId, fee, papers }: { examId: string; fee: number; papers: Paper[] }) {
  const [selected, setSelected] = useState<string[]>(papers.filter((p) => p.eligible).map((p) => p.paperId));
  const [step, setStep] = useState<"select" | "pay">("select");
  const [method, setMethod] = useState("UPI");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const pay = () =>
    start(async () => {
      setError(null);
      const res = await submitRegistrationAction(examId, selected, method);
      if ("error" in res && res.error) {
        setError(res.error);
        setStep("select");
      } else toast.success("Payment successful — registration submitted");
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader title="Select papers" description="Eligible papers are pre-selected" />
        <ul className="divide-y divide-border">
          {papers.map((p) => (
            <li key={p.paperId} className={cn("flex items-start gap-3 px-5 py-3", !p.eligible && "bg-red-50/40")}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand-600"
                checked={selected.includes(p.paperId)}
                disabled={!p.eligible || step === "pay"}
                onChange={() => toggle(p.paperId)}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                  <span className="font-medium">{p.title}</span>
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(p.date, true)} · {p.session === "FN" ? "Forenoon" : "Afternoon"}</div>
                {!p.eligible && <div className="mt-1 text-xs font-medium text-red-700">Not eligible: {p.reason}</div>}
              </div>
              <Badge tone={p.eligible ? (p.status === "RELAXED" ? "blue" : "green") : p.status === "PENDING_RELAXATION" ? "amber" : "red"}>{p.status.replace("_", " ")}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Examination fee" />
        <CardBody className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{selected.length} paper(s)</span>
            <span className="text-2xl font-semibold">₹{fee.toLocaleString("en-IN")}</span>
          </div>
          {error && <Callout tone="red" title="Registration blocked">{error}</Callout>}
          {step === "select" ? (
            <Button className="w-full" size="lg" disabled={!selected.length} onClick={() => setStep("pay")}>
              Proceed to payment
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Secure payment gateway (sandbox)
                </div>
                {["UPI", "NETBANKING", "CARD"].map((m) => (
                  <label key={m} className="flex items-center gap-2 py-1 text-sm">
                    <input type="radio" name="method" className="accent-brand-600" checked={method === m} onChange={() => setMethod(m)} />
                    {m === "UPI" ? "UPI" : m === "NETBANKING" ? "Net banking" : "Debit / credit card"}
                  </label>
                ))}
              </div>
              <Button className="w-full" size="lg" variant="success" disabled={pending} onClick={pay}>
                <CreditCard className="h-4 w-4" /> {pending ? "Processing payment…" : `Pay ₹${fee.toLocaleString("en-IN")} & submit`}
              </Button>
              <Button className="w-full" variant="ghost" disabled={pending} onClick={() => setStep("select")}>
                Back
              </Button>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Eligibility is re-validated on the server at submission; the fee is reconciled automatically with the finance ledger.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
