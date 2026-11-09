import type { Locale } from "./config";
import { MESSAGES, type MessageKey } from "./messages";

export type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** Translator for one language. English text is the key; `t.loose` accepts any string and falls back to it unchanged. */
export type T = {
  (key: MessageKey, vars?: Vars): string;
  loose: (text: string, vars?: Vars) => string;
  locale: Locale;
};

export function makeT(locale: Locale): T {
  const lookup = (text: string, vars?: Vars) => {
    if (locale === "en") return fill(text, vars);
    const entry = (MESSAGES as Record<string, readonly [string, string]>)[text];
    return fill(entry ? entry[locale === "as" ? 0 : 1] : text, vars);
  };
  const t = ((key: MessageKey, vars?: Vars) => lookup(key, vars)) as T;
  t.loose = lookup;
  t.locale = locale;
  return t;
}
