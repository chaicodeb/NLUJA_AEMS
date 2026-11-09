"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, FileSignature, LogOut, Save, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n";
import { bankDetailsAction, decideClearanceAction, issueCertificatesAction, refundAction, saveAlumniAction, startExitAction } from "./actions";

type Result = { error?: string; ok?: boolean };
const report = (r: Result, success: string) => {
  if (r.error) toast.error(r.error);
  else toast.success(success);
};

export function ClearanceActions({ studentId, department, name, status, atExit }: { studentId: string; department: string; name: string; status: string; atExit: boolean }) {
  const [mode, setMode] = useState<"" | "DUES" | "DEDUCT">("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const run = (decision: "CLEAR" | "DUES" | "DEDUCT", success: string) =>
    start(async () => {
      const r = await decideClearanceAction(studentId, department, decision, Number(amount), note);
      report(r, success);
      if (!r.error) setMode("");
    });

  if (mode)
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Input className="h-8 w-24 text-xs" inputMode="numeric" placeholder="₹ amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label="Amount" />
        <Input className="h-8 w-56 text-xs" placeholder={mode === "DEDUCT" ? "e.g. Broken chair, room B-214" : "e.g. 2 books overdue"} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Details" />
        <Button size="sm" variant={mode === "DEDUCT" ? "accent" : "default"} disabled={pending} onClick={() => run(mode, mode === "DEDUCT" ? `₹${amount} recovered from ${name}'s caution deposit; cleared` : `Dues recorded for ${name}`)}>
          {mode === "DEDUCT" ? "Recover & clear" : "Record dues"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("")}>Cancel</Button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button size="sm" variant="success" disabled={pending} onClick={() => run("CLEAR", `${name} cleared — no dues`)}>
        <Check className="h-3.5 w-3.5" /> {status === "DUES" ? "Dues settled" : "No dues"}
      </Button>
      {status === "PENDING" && (
        <Button size="sm" variant="outline" onClick={() => setMode("DUES")}>
          <TriangleAlert className="h-3.5 w-3.5" /> Dues
        </Button>
      )}
      {atExit && (
        <Button size="sm" variant="outline" onClick={() => setMode("DEDUCT")}>
          <Wallet className="h-3.5 w-3.5" /> From deposit
        </Button>
      )}
    </div>
  );
}

export function RefundButton({ studentId, net }: { studentId: string; net: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="success"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refundAction(studentId);
          if (r.error) toast.error(r.error);
          else if ("ref" in r) toast.success(`₹${r.net} refunded — NEFT ${r.ref}`);
        })
      }
    >
      <Banknote className="h-3.5 w-3.5" /> Refund ₹{net.toLocaleString("en-IN")}
    </Button>
  );
}

export function IssueCertificatesButton({ studentId, name }: { studentId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => start(async () => report(await issueCertificatesAction(studentId), `Migration and character certificates signed and issued to ${name}`))}>
      <FileSignature className="h-3.5 w-3.5" /> {pending ? "Signing…" : "Issue certificates"}
    </Button>
  );
}

export function StartExitForm({ graduating }: { graduating: boolean }) {
  const t = useT();
  const [type, setType] = useState(graduating ? "GRADUATION" : "WITHDRAWAL");
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="exit-type">{t("Reason for leaving")}</Label>
          <Select id="exit-type" value={type} onChange={(e) => setType(e.target.value)}>
            {graduating && <option value="GRADUATION">{t("Completed the programme")}</option>}
            <option value="WITHDRAWAL">{t("Withdrawal from the programme")}</option>
            <option value="TRANSFER">{t("Transfer to another university")}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="exit-address">{t("Forwarding address")}</Label>
          <Input id="exit-address" placeholder={t("Where certificates and refunds correspondence should go")} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>
      {type !== "GRADUATION" && (
        <div className="space-y-1">
          <Label htmlFor="exit-reason">{t("Explain briefly")}</Label>
          <Textarea id="exit-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <div className="flex justify-end">
        <Button disabled={pending} onClick={() => start(async () => report(await startExitAction(type, reason, address), t("No-dues requests sent to the Library, Hostel, Accounts and Examination Branch")))}>
          <LogOut className="h-4 w-4" /> {t("Start exit formalities")}
        </Button>
      </div>
    </div>
  );
}

export function BankDetailsForm() {
  const t = useT();
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="bank-ac">{t("Bank account number")}</Label>
        <Input id="bank-ac" inputMode="numeric" className="w-52" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-ifsc">IFSC</Label>
        <Input id="bank-ifsc" className="w-36 uppercase" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
      </div>
      <Button disabled={pending} onClick={() => start(async () => report(await bankDetailsAction(account, ifsc), t("Refund account saved — Accounts will release the deposit after clearance")))}>
        <Save className="h-4 w-4" /> {t("Save")}
      </Button>
    </div>
  );
}

type Profile = { sector: string; organisation: string; designation: string; city: string; phone: string; qualifiedExams: string[]; directoryConsent: boolean; mentor: boolean };

export function AlumniProfileForm({ initial, sectors, exams }: { initial: Profile; sectors: [string, string][]; exams: string[] }) {
  const t = useT();
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="al-sector">{t("What are you doing now?")}</Label>
          <Select id="al-sector" value={p.sector} onChange={(e) => set("sector", e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {sectors.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-org">{t("Organisation / institution")}</Label>
          <Input id="al-org" value={p.organisation} onChange={(e) => set("organisation", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-desig">{t("Designation / course")}</Label>
          <Input id="al-desig" value={p.designation} onChange={(e) => set("designation", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-city">{t("City")}</Label>
          <Input id="al-city" value={p.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-phone">{t("Phone (shown only to the alumni office)")}</Label>
          <Input id="al-phone" value={p.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-medium">{t("Examinations qualified")}</div>
        <div className="flex flex-wrap gap-3 text-sm">
          {exams.map((e) => (
            <label key={e} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={p.qualifiedExams.includes(e)} onChange={(ev) => set("qualifiedExams", ev.target.checked ? [...p.qualifiedExams, e] : p.qualifiedExams.filter((x) => x !== e))} />
              {e}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={p.directoryConsent} onChange={(e) => set("directoryConsent", e.target.checked)} /> {t("List me in the alumni directory")}
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={p.mentor} onChange={(e) => set("mentor", e.target.checked)} /> {t("I am willing to mentor current students")}
        </label>
      </div>
      <div className="flex justify-end">
        <Button disabled={pending} onClick={() => start(async () => report(await saveAlumniAction(p), t("Alumni profile saved — welcome to the NLUJA alumni network")))}>
          <Save className="h-4 w-4" /> {t("Save profile")}
        </Button>
      </div>
    </div>
  );
}
