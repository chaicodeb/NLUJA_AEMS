"use client";

import { useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { sendNoticesAction } from "./actions";

export function NoticesButton({ batchId, count }: { batchId: string; count: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || count === 0}
      onClick={() =>
        start(async () => {
          const r = await sendNoticesAction(batchId);
          if ("error" in r && r.error) toast.error(r.error);
          else toast.success(`${"sent" in r ? r.sent : 0} shortage notice(s) sent to students and parents${"sent" in r && r.sent === 0 ? " — today's notices were already sent" : ""}`);
        })
      }
    >
      <Send className="h-3.5 w-3.5" /> Send shortage notices ({count})
    </Button>
  );
}
