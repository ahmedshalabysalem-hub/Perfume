import "@fontsource-variable/inter";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "../globals.css";

import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Providers } from "@/components/shared/providers";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localeDirection } from "@/i18n/routing";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: `${t("storeName")} — ${t("storeTagline")}`, template: `%s · ${t("storeName")}` },
    description: t("storeDescription"),
    applicationName: t("storeName"),
  };
}

export const viewport: Viewport = {
  themeColor: "#1f1a17",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await initLocale(params);

  // Reading request headers opts every page into dynamic rendering, which the
  // per-request CSP nonce requires (see src/proxy.ts and ADR-006).
  await headers();

  const dir = localeDirection(locale);
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      {/* Browser extensions (e.g. converters) add attributes to <body> before React hydrates;
          ignore that one level only — mismatches inside the tree are still reported. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <NextIntlClientProvider>
          <Providers dir={dir}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
