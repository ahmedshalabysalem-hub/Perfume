import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CartView } from "@/components/store/cart/cart-view";
import { initLocale, metadataLocale } from "@/i18n/params";
import { getCurrentMarket } from "@/server/modules/storefront/storefront.service";
import { marketInfo } from "../market-info";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "store.cart" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const locale = await initLocale(params);
  const t = await getTranslations("store.cart");
  const market = await getCurrentMarket();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-4xl" data-testid="page-title">
        {t("title")}
      </h1>
      {market ? (
        <CartView market={marketInfo(market, locale)} />
      ) : (
        <p className="text-muted-foreground">{t("checkoutClosed")}</p>
      )}
    </div>
  );
}
