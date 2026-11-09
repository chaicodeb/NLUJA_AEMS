"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n";
import { applyLeaveAction } from "../../attendance/actions";

export function LeaveForm() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("DUTY");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [document, setDocument] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("Apply for leave")}
      </Button>
    );
  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <Select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="DUTY">{t("Duty leave — representing the University")}</option>
        <option value="MEDICAL">{t("Medical leave")}</option>
      </Select>
      <div className="flex items-center gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("From")} />
        <span className="text-sm text-muted-foreground">{t("to")}</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("To")} />
      </div>
      <Textarea className="sm:col-span-2" rows={2} placeholder={t("Reason (event, hospital, etc.)")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="text-sm sm:col-span-2">
        <span className="text-muted-foreground">{t("Supporting document (certificate / medical record)")}</span>
        <input type="file" accept=".pdf,.jpg,.png" className="mt-1 block text-sm" onChange={(e) => setDocument(e.target.files?.[0]?.name ?? "")} />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
        <Button
          size="sm"
          disabled={pending || !from || !to || reason.trim().length < 10}
          onClick={() =>
            start(async () => {
              const r = await applyLeaveAction({ type, from, to, reason, document });
              if ("error" in r && r.error) toast.error(t.loose(r.error));
              else {
                toast.success(t("Leave application submitted to the Dean"));
                setOpen(false);
              }
            })
          }
        >
          <Send className="h-3.5 w-3.5" /> {t("Submit")}
        </Button>
      </div>
    </div>
  );
}
