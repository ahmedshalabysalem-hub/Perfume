import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: process.env.APP_TIME_ZONE ?? "Asia/Riyadh",
    // Latin digits in both locales keep prices, SKUs and barcodes consistent.
    formats: {
      number: {
        integer: { maximumFractionDigits: 0, numberingSystem: "latn" },
        decimal: { maximumFractionDigits: 2, numberingSystem: "latn" },
      },
      dateTime: {
        short: { dateStyle: "medium", numberingSystem: "latn" },
        long: { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" },
      },
    },
  };
});
