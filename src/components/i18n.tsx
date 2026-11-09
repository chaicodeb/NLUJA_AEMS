"use client";

import { createContext, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, type Locale } from "@/lib/i18n/config";
import { makeT } from "@/lib/i18n/translate";
import { setLocaleAction } from "@/lib/i18n/actions";
import { cn } from "@/lib/utils";

const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeT(locale), [locale]);
}

/** English / অসমীয়া / हिन्दी switcher; the choice is remembered in a cookie. */
export function LanguageSwitcher({ dark = false, className }: { dark?: boolean; className?: string }) {
  const locale = useContext(LocaleContext);
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="group"
      aria-label={t("Language")}
      className={cn("inline-flex items-center rounded-md border p-0.5 text-xs", dark ? "border-white/20 bg-white/5" : "border-border bg-white", pending && "opacity-60", className)}
    >
      <Languages className={cn("mx-1 h-3.5 w-3.5", dark ? "text-white/60" : "text-muted-foreground")} aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={LOCALE_NAMES[l]}
          aria-pressed={l === locale}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setLocaleAction(l);
              router.refresh();
            })
          }
          className={cn(
            "rounded px-1.5 py-0.5 font-medium transition-colors",
            l === locale ? (dark ? "bg-white text-ink-900" : "bg-brand-700 text-white") : dark ? "text-white/80 hover:bg-white/10" : "text-foreground hover:bg-muted",
          )}
        >
          <span className="hidden sm:inline">{LOCALE_NAMES[l]}</span>
          <span className="sm:hidden">{LOCALE_SHORT[l]}</span>
        </button>
      ))}
    </div>
  );
}
