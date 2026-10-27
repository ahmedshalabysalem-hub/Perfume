"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { publicFileUrl } from "@/lib/files";
import { localized } from "@/lib/utils";
import type { PricedCartLine } from "@/server/modules/orders/cart.service";
import { ProductArt } from "../product-art";

/** What the storefront needs to know about the visitor's market on the client. */
export type MarketInfo = {
  code: string;
  countryName: string;
  currencyCode: string;
  minorUnits: number;
  pricesIncludeTax: boolean;
};

/** Message keys (store.cart) explaining why a line cannot be ordered. */
export const LINE_PROBLEM_KEYS = {
  UNAVAILABLE: "lineUnavailable",
  OUT_OF_STOCK: "lineOutOfStock",
  INSUFFICIENT_STOCK: "lineInsufficient",
} as const;

/** "Rose Taifi · 50 ml · Tester" in the visitor's language. */
export function useLineNames() {
  const locale = useLocale();
  const variantText = useTranslations("variants");
  const t = useTranslations("store.product");
  return (line: PricedCartLine) => {
    const product = localized(locale, line.productNameAr ?? "", line.productNameEn ?? "");
    const brand = localized(locale, line.brandNameAr ?? "", line.brandNameEn ?? "");
    const size =
      localized(locale, line.variantNameAr ?? "", line.variantNameEn ?? "") ||
      (line.sizeMl ? variantText("ml", { size: line.sizeMl.replace(/\.0+$/, "") }) : (line.sku ?? ""));
    const variant = line.isTester ? `${size} · ${t("tester")}` : size;
    return { product, brand, variant };
  };
}

export function CartLineImage({ line, size = "md" }: { line: PricedCartLine; size?: "sm" | "md" }) {
  const locale = useLocale();
  const t = useTranslations("store.product");
  const name = localized(locale, line.productNameAr ?? "", line.productNameEn ?? "");
  const box = size === "sm" ? "size-14" : "size-20 sm:size-24";
  return (
    <div className={`relative ${box} shrink-0 overflow-hidden rounded-lg bg-muted`}>
      {line.imageKey ? (
        <Image
          src={publicFileUrl(line.imageKey)}
          alt={localized(locale, line.imageAltAr ?? "", line.imageAltEn ?? "") || name}
          fill
          sizes="96px"
          className="object-cover"
        />
      ) : (
        <ProductArt
          seed={line.productSlug ?? line.variantId}
          family={null}
          label={t("illustrationAlt", { name })}
          className="size-full"
        />
      )}
    </div>
  );
}
