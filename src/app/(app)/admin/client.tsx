"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, History, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { restoreBackupAction, runBackupAction, verifyBackupAction } from "./actions";

export function BackupNowButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="accent"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runBackupAction();
          if ("error" in r && r.error) toast.error(r.error);
          else if ("sizeBytes" in r) toast.success(`Backup complete — ${r.rows?.toLocaleString("en-IN")} rows, ${Math.round((r.sizeBytes ?? 0) / 1024)} KB`);
        })
      }
    >
      <DatabaseBackup className="h-4 w-4" /> {pending ? "Backing up…" : "Back up now"}
    </Button>
  );
}

export function VerifyButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await verifyBackupAction(id);
          if ("error" in r && r.error) toast.error(r.error);
          else if ("rows" in r) toast.success(`Verified: checksum matches, ${r.tables} tables and ${r.rows?.toLocaleString("en-IN")} rows read back`);
        })
      }
    >
      <ShieldCheck className="h-3.5 w-3.5" /> Verify
    </Button>
  );
}

export function RestoreButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <Button size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" /> Restore
      </Button>
    );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-xl">
        <div className="font-serif text-lg font-semibold">Restore {label}?</div>
        <p className="text-sm text-muted-foreground">
          Every record in the system is replaced with the contents of this backup. The current state is first saved as a safety backup, so the restore itself can be undone. Users may need to sign in again.
        </p>
        <Input placeholder="Type RESTORE to confirm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Type RESTORE to confirm" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={pending || text !== "RESTORE"}
            onClick={() =>
              start(async () => {
                const r = await restoreBackupAction(id, text);
                if ("error" in r && r.error) return void toast.error(r.error);
                toast.success(`Restored in ${"seconds" in r ? r.seconds?.toFixed(1) : "?"} s`);
                router.push("/login");
              })
            }
          >
            {pending ? "Restoring…" : "Restore"}
          </Button>
        </div>
      </div>
    </div>
  );
}
