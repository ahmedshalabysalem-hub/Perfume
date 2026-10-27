import "server-only";
import { deliversTo } from "@/lib/schemas/checkout";
import type { DbClient } from "@/server/db";

/**
 * The company behind a storefront market (ADR-025): the market's one active
 * ONLINE store, its legal entity and its fulfilment warehouse. Resolved on the
 * server from the market alone — the browser never names a store, company or
 * warehouse. Null means the market cannot take orders (no store, more than one
 * active online store, no active fulfilment warehouse, or no delivery rules).
 */
export type OnlineStore = {
  storeId: string;
  storeNameEn: string;
  storeNameAr: string;
  storePhone: string | null;
  storeEmail: string | null;
  legalEntityId: string;
  countryCode: string;
  currencyCode: string;
  minorUnits: number;
  pricesIncludeTax: boolean;
  warehouseId: string;
};

export async function resolveOnlineStore(client: DbClient, countryCode: string): Promise<OnlineStore | null> {
  if (!deliversTo(countryCode)) return null;
  const stores = await client.store.findMany({
    where: {
      countryCode,
      type: "ONLINE",
      isActive: true,
      legalEntity: { isActive: true },
      country: { isActive: true },
    },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      phone: true,
      email: true,
      legalEntityId: true,
      countryCode: true,
      fulfilmentWarehouse: { select: { id: true, isActive: true } },
      country: { select: { currencyCode: true, pricesIncludeTax: true, currency: { select: { minorUnits: true } } } },
    },
    take: 2,
  });
  if (stores.length !== 1) return null;
  const store = stores[0]!;
  if (!store.fulfilmentWarehouse?.isActive) return null;
  return {
    storeId: store.id,
    storeNameEn: store.nameEn,
    storeNameAr: store.nameAr,
    storePhone: store.phone,
    storeEmail: store.email,
    legalEntityId: store.legalEntityId,
    countryCode: store.countryCode,
    currencyCode: store.country.currencyCode,
    minorUnits: store.country.currency.minorUnits,
    pricesIncludeTax: store.country.pricesIncludeTax,
    warehouseId: store.fulfilmentWarehouse.id,
  };
}
