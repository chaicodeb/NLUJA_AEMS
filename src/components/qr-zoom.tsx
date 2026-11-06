"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Maximize2, Share2, Smartphone, X } from "lucide-react";
import { toast } from "sonner";

/** Small QR code that opens a large, scannable version in a pop-up. */
export function QrZoom({ src, url, note, size }: { src: string; url: string; note: string; size: number }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canShare = open && typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select the address and copy it manually");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Enlarge QR code"
        title="Click to enlarge"
        className="group relative shrink-0 cursor-zoom-in rounded bg-white p-1 ring-brand-400 transition hover:ring-2 focus-visible:outline-none focus-visible:ring-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
        <img src={src} alt={`QR code for ${url}`} width={size} height={size} />
        <span className="absolute right-0.5 bottom-0.5 rounded bg-ink-900/80 p-0.5 text-white opacity-80 transition group-hover:opacity-100">
          <Maximize2 className="h-3 w-3" />
        </span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="QR code to open this demo">
            <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="relative w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-2xl sm:p-6">
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center justify-center gap-1.5 font-serif text-lg font-semibold text-foreground">
                <Smartphone className="h-5 w-5 text-brand-700" /> Open on your phone
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{note}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
              <img src={src} alt={`QR code for ${url}`} className="mx-auto mt-4 aspect-square w-full max-w-[min(360px,70vh)] rounded-lg border border-border p-2" />
              <div className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all text-foreground select-all">{url}</div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium hover:bg-muted">
                  <Copy className="h-4 w-4" /> Copy link
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={() => navigator.share({ title: "NLUJA AEMS demo", url }).catch(() => {})}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
