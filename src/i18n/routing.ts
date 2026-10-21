import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Every URL carries its locale (/ar/..., /en/...): unambiguous for SEO and
  // for the CSP/auth logic in src/proxy.ts.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

const RTL_LOCALES: ReadonlySet<string> = new Set(["ar"]);

export function localeDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}
