"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "./i18n";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

/** Registers the service worker (production builds) and keeps the browser's install prompt for the Install button. */
export function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPrompt;
      listeners.forEach((l) => l());
    };
    const onInstalled = () => {
      deferred = null;
      listeners.forEach((l) => l());
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Shown when the browser can install the portal (Android/desktop Chrome and Edge) or on iPhone Safari (with instructions). */
export function InstallAppButton({ className, dark = false }: { className?: string; dark?: boolean }) {
  const t = useT();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const update = () => setAvailable(!isStandalone() && (!!deferred || isIos()));
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (deferred) {
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          if (outcome === "accepted") toast.success(t("App installed — open it from your home screen"));
          deferred = null;
          listeners.forEach((l) => l());
        } else toast.info(t("On iPhone or iPad: tap Share, then Add to Home Screen."), { duration: 8000 });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium",
        dark ? "border-white/20 bg-white/5 text-white hover:bg-white/10" : "border-border bg-white hover:bg-muted",
        className,
      )}
    >
      <Download className="h-3.5 w-3.5" /> <span>{t("Install app")}</span>
    </button>
  );
}
