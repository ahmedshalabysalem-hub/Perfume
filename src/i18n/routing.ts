import { defineRouting } from "next-intl/routing";

/** next-intl's cookie holding the language chosen on this device. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Every URL carries its locale (/ar/..., /en/...): unambiguous for SEO and
  // for the CSP/auth logic in src/proxy.ts.
  localePrefix: "always",
  // Remember the visitor's choice for a year so "/" reopens in that language
  // (next-intl's default is a session cookie).
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];

const RTL_LOCALES: ReadonlySet<string> = new Set(["ar"]);

export function localeDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}
