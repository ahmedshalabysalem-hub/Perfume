import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckoutView } from "@/components/store/cart/checkout-view";
import { initLocale, metadataLocale } from "@/i18n/params";
import { EG_GOVERNORATES } from "@/lib/schemas/checkout";
import { db } from "@/server/db";
import { resolveOnlineStore } from "@/server/modules/orders/online-store";
import { getCurrentMarket } from "@/server/modules/storefront/storefront.service";
import { marketInfo } from "../market-info";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const locale = await initLocale(params);
  const t = await getTranslations("store.checkout");
  const market = await getCurrentMarket();
  const store = market ? await resolveOnlineStore(db, market.code) : null;
  const governorates = EG_GOVERNORATES.map((governorate) => ({
    value: governorate.code,
    label: locale === "ar" ? governorate.ar : governorate.en,
  }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-4xl" data-testid="page-title">
        {t("title")}
      </h1>
      {market && store ? (
        <CheckoutView market={marketInfo(market, locale)} governorates={governorates} />
      ) : (
        <p className="text-muted-foreground" data-testid="checkout-closed">
          {t("closed")}
        </p>
      )}
    </div>
  );
}
