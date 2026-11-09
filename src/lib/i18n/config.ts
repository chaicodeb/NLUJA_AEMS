export const LOCALES = ["en", "as", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "nluja_lang";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", as: "অসমীয়া", hi: "हिन्दी" };
export const LOCALE_SHORT: Record<Locale, string> = { en: "EN", as: "অ", hi: "हि" };
export const HTML_LANG: Record<Locale, string> = { en: "en-IN", as: "as-IN", hi: "hi-IN" };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
