"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

/** Opens the guides relevant to the current screen. */
export function HelpButton() {
  const path = usePathname();
  return (
    <Link href={`/help?path=${encodeURIComponent(path)}`} title="Help for this screen" aria-label="Help for this screen" className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
      <CircleHelp className="h-4 w-4" />
    </Link>
  );
}
