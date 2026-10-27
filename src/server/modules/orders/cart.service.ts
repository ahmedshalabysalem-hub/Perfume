import "server-only";
import { sanitizeCartLines, type CartLine } from "@/lib/cart";
import { multiplyMoney, sumMoney } from "@/lib/money";
import type { DbClient } from "@/server/db";
import { sellableQuantities } from "@/server/modules/inventory/reservations";
import { resolveOnlineStore, type OnlineStore } from "./online-store";

/**
 * Authoritative cart pricing (ADR-025). Given only variant ids and
 * quantities, look up what may be sold in the store's market right now, at
 * which price, and whether the store's warehouse has enough eligible stock.
 * Used by the cart page, the checkout summary and order placement, so all
 * three agree. No purchase cost, supplier or stock figure leaves this module.
 */

export type CartLineStatus = "OK" | "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK";

export type PricedCartLine = {
  variantId: string;
  quantity: number;
  status: CartLineStatus;
  productId: string | null;
  productSlug: string | null;
  productNameEn: string | null;
  productNameAr: string | null;
  brandNameEn: string | null;
  brandNameAr: string | null;
  variantNameEn: string | null;
  variantNameAr: string | null;
  sizeMl: string | null;
  isTester: boolean;
  sku: string | null;
  imageKey: string | null;
  imageAltEn: string | null;
  imageAltAr: string | null;
  /** Null when the line is UNAVAILABLE. */
  unitPrice: string | null;
  lineTotal: string | null;
};

export type PricedCart = {
  lines: PricedCartLine[];
  currencyCode: string;
  minorUnits: number;
  pricesIncludeTax: boolean;
  /** Sum of the purchasable (OK) lines. */
  subtotal: string;
  itemCount: number;
  /** Every line is OK and the cart is not empty. */
  canCheckout: boolean;
};

/** Catalogue facts of variants that may be sold in `countryCode` now. */
export async function loadSellableVariants(client: DbClient, countryCode: string, variantIds: string[]) {
  const variants = await client.productVariant.findMany({
    where: {
      id: { in: variantIds },
      status: "ACTIVE",
      trackInventory: true,
      product: { status: "PUBLISHED", brand: { isActive: true } },
      prices: { some: { countryCode, isActive: true } },
    },
    select: {
      id: true,
      sku: true,
      nameEn: true,
      nameAr: true,
      sizeMl: true,
      isTester: true,
      prices: { where: { countryCode, isActive: true }, select: { amount: true } },
      product: {
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameAr: true,
          brand: { select: { nameEn: true, nameAr: true } },
          images: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { storageKey: true, altEn: true, altAr: true },
          },
        },
      },
    },
  });
  return new Map(variants.map((variant) => [variant.id, variant]));
}

export async function priceCart(client: DbClient, store: OnlineStore, rawLines: unknown): Promise<PricedCart> {
  const cart: CartLine[] = sanitizeCartLines(rawLines);
  const variantIds = cart.map((line) => line.variantId);
  const [variants, stock] = await Promise.all([
    loadSellableVariants(client, store.countryCode, variantIds),
    sellableQuantities(client, variantIds, store.warehouseId),
  ]);
  const lines = cart.map((line): PricedCartLine => {
    const variant = variants.get(line.variantId);
    const available = stock.get(line.variantId) ?? 0;
    const status: CartLineStatus = !variant
      ? "UNAVAILABLE"
      : available <= 0
        ? "OUT_OF_STOCK"
        : available < line.quantity
          ? "INSUFFICIENT_STOCK"
          : "OK";
    const unitPrice = variant ? variant.prices[0]!.amount.toFixed(store.minorUnits) : null;
    const image = variant?.product.images[0];
    return {
      variantId: line.variantId,
      quantity: line.quantity,
      status,
      productId: variant?.product.id ?? null,
      productSlug: variant?.product.slug ?? null,
      productNameEn: variant?.product.nameEn ?? null,
      productNameAr: variant?.product.nameAr ?? null,
      brandNameEn: variant?.product.brand.nameEn ?? null,
      brandNameAr: variant?.product.brand.nameAr ?? null,
      variantNameEn: variant?.nameEn ?? null,
      variantNameAr: variant?.nameAr ?? null,
      sizeMl: variant?.sizeMl ? variant.sizeMl.toString() : null,
      isTester: variant?.isTester ?? false,
      sku: variant?.sku ?? null,
      imageKey: image?.storageKey ?? null,
      imageAltEn: image?.altEn ?? null,
      imageAltAr: image?.altAr ?? null,
      unitPrice,
      lineTotal: unitPrice ? multiplyMoney(unitPrice, line.quantity, store.minorUnits) : null,
    };
  });
  const purchasable = lines.filter((line) => line.status === "OK");
  return {
    lines,
    currencyCode: store.currencyCode,
    minorUnits: store.minorUnits,
    pricesIncludeTax: store.pricesIncludeTax,
    subtotal: sumMoney(
      purchasable.map((line) => line.lineTotal!),
      store.minorUnits,
    ),
    itemCount: purchasable.reduce((sum, line) => sum + line.quantity, 0),
    canCheckout: lines.length > 0 && purchasable.length === lines.length,
  };
}

/**
 * Which of `variantIds` can be added to a cart in `countryCode` right now: the
 * market has an online store taking orders, the variant is sellable there and
 * its warehouse holds eligible stock. Only in/out of stock is exposed, never
 * a quantity.
 */
export async function cartAvailability(
  client: DbClient,
  countryCode: string,
  variantIds: string[],
): Promise<{ checkoutOpen: boolean; inStock: Set<string> }> {
  const store = await resolveOnlineStore(client, countryCode);
  if (!store) return { checkoutOpen: false, inStock: new Set() };
  const ids = [...new Set(variantIds)];
  const [variants, stock] = await Promise.all([
    loadSellableVariants(client, store.countryCode, ids),
    sellableQuantities(client, ids, store.warehouseId),
  ]);
  return {
    checkoutOpen: true,
    inStock: new Set(ids.filter((id) => variants.has(id) && (stock.get(id) ?? 0) > 0)),
  };
}
