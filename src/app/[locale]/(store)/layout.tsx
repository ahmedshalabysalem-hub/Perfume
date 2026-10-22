import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MarketSwitcher } from "@/components/store/market-switcher";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getCurrentMarket, listMarkets } from "@/server/modules/storefront/storefront.service";

export default async function StoreLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await initLocale(params);
  const [markets, market] = await Promise.all([listMarkets(), getCurrentMarket()]);
  const t = await getTranslations("store");
  const meta = await getTranslations("metadata");
  const common = await getTranslations("common");
  const nav = [
    { href: "/products", label: t("nav.shop") },
    { href: "/products?category=perfumes", label: t("nav.perfumes") },
    { href: "/products?category=perfume-oils", label: t("nav.oils") },
    { href: "/products?category=gift-sets", label: t("nav.gifts") },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2"
      >
        {common("skipToContent")}
      </a>
      <div className="bg-primary px-4 py-2 text-center text-xs tracking-wide text-primary-foreground">
        {meta("storeTagline")}
      </div>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link href="/" className="font-display text-2xl tracking-wide sm:text-3xl" data-testid="store-logo">
            {meta("storeName")}
          </Link>
          <nav
            aria-label={t("nav.shop")}
            className="order-3 -mx-2 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:mx-0 sm:w-auto"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 whitespace-nowrap hover:bg-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            {market ? (
              <MarketSwitcher
                current={market.code}
                markets={markets.map((candidate) => ({
                  code: candidate.code,
                  label: t("marketLabel", {
                    country: localized(locale, candidate.nameAr, candidate.nameEn),
                    currency: candidate.currencyCode,
                  }),
                }))}
              />
            ) : null}
            <LocaleSwitcher />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mt-24 border-t bg-card">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
          <div>
            <p className="font-display text-2xl">{meta("storeName")}</p>
            <p className="mt-2 text-muted-foreground">{t("footer.about")}</p>
          </div>
          <nav className="grid content-start gap-2">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="grid content-start gap-2 sm:text-end">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              {t("footer.admin")}
            </Link>
            <p className="text-muted-foreground">{t("footer.rights", { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
