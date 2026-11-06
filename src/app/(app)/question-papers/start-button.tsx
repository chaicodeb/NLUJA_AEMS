"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { startPaperAction } from "./actions";

export function StartButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await startPaperAction(id);
          if ("error" in res) toast.error(res.error);
          else router.push(`/question-papers/${id}`);
        })
      }
    >
      <FilePen className="h-4 w-4" /> Start drafting
    </Button>
  );
}
