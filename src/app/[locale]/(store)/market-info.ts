import type { MarketInfo } from "@/components/store/cart/cart-line";
import { localized } from "@/lib/utils";
import type { Market } from "@/server/modules/storefront/storefront.service";

export function marketInfo(market: Market, locale: string): MarketInfo {
  return {
    code: market.code,
    countryName: localized(locale, market.nameAr, market.nameEn),
    currencyCode: market.currencyCode,
    minorUnits: market.minorUnits,
    pricesIncludeTax: market.pricesIncludeTax,
  };
}
