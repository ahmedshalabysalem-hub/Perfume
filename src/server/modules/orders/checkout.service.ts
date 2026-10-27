import "server-only";
import { createHash } from "node:crypto";
import { env, isProduction } from "@/lib/env";
import { compareDecimalStrings, multiplyMoney, sumMoney } from "@/lib/money";
import { checkoutDetailsSchema, placeOrderInputSchema, type CheckoutDetails } from "@/lib/schemas/checkout";
import { recordAudit } from "@/server/audit/audit";
import type { ServiceContext } from "@/server/context";
import { db, type Tx } from "@/server/db";
import { ConflictError, InvalidStateError } from "@/server/errors";
import { lockPostingKey } from "@/server/modules/inventory/ledger";
import { reserveStock } from "@/server/modules/inventory/reservations";
import { consumeThrottle, type ThrottleRule } from "@/server/throttle";
import { parseInput } from "@/server/validation";
import { ORDER_ACCESS_DAYS, hasOrderAccess, orderAccessToken } from "./access-token";
import { loadSellableVariants } from "./cart.service";
import { resolveOnlineStore, type OnlineStore } from "./online-store";
import { expireOverdueOrders } from "./orders.service";

/**
 * Guest checkout (ORD-001, ADR-025). One transaction creates the order, its
 * lines (catalogue snapshot at the current market price) and the stock
 * reservations, or nothing. The browser supplies only variant ids, quantities
 * and the customer's details; the store, company, warehouse, currency, prices
 * and totals are all decided here. No payment is taken or recorded: the order
 * starts PENDING_REVIEW and UNPAID.
 *
 * Duplicate submissions: the browser sends one random key per checkout
 * attempt; the same key with the same request returns the order already
 * created (double click, timeout, retry, refresh), a different request under
 * that key is refused.
 */

/** Orders per client address per window — generous for people, tight for scripts. */
export const CHECKOUT_THROTTLE: ThrottleRule = { name: "checkout", limit: 8, windowSeconds: 15 * 60 };

/**
 * Orders one mobile number may have awaiting review at once. Unpaid orders
 * hold stock, so a number cannot keep placing them; once staff confirm or
 * cancel one (or it expires), the customer can order again.
 */
export const MAX_OPEN_ORDERS_PER_PHONE = 3;

export type LineProblem = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "PRICE_CHANGED";

/** The cart no longer matches what can be sold; field errors are `lines.<variantId>`: [problem]. */
export class CartChangedError extends ConflictError {
  constructor(problems: Map<string, LineProblem>) {
    super(
      "errors.checkout.cartChanged",
      Object.fromEntries([...problems].map(([variantId, problem]) => [`lines.${variantId}`, [problem]])),
    );
  }
}

export type PlacedOrder = { orderId: string; orderNumber: string; accessToken: string; replayed: boolean };

function requestHash(
  store: OnlineStore,
  lines: Array<{ variantId: string; quantity: number }>,
  details: CheckoutDetails,
) {
  const canonical = JSON.stringify({
    store: store.storeId,
    lines: [...lines]
      .map((line) => [line.variantId, line.quantity])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    details,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function nextOrderNumber(tx: Tx, countryCode: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ last_value: number }>>`
    INSERT INTO "order_number_counters" ("country_code", "last_value", "updated_at")
    VALUES (${countryCode}, 1, now())
    ON CONFLICT ("country_code") DO UPDATE
      SET "last_value" = "order_number_counters"."last_value" + 1, "updated_at" = now()
    RETURNING "last_value"`;
  return `${countryCode}-${String(rows[0]!.last_value).padStart(6, "0")}`;
}

/**
 * Place a guest order in the storefront market `countryCode` (resolved by the
 * caller from the visitor's market cookie, never from the request body).
 */
export async function placeOrder(ctx: ServiceContext, countryCode: string, rawInput: unknown): Promise<PlacedOrder> {
  const input = parseInput(placeOrderInputSchema, rawInput);
  const store = await resolveOnlineStore(db, countryCode);
  if (!store) throw new InvalidStateError("errors.checkout.unavailable");
  const details = parseInput(checkoutDetailsSchema(store.countryCode), input.details);
  // Unpaid orders hold stock; in production they are only taken from a client
  // the per-address limit can count, unless the operator opted out explicitly.
  if (!ctx.meta.ipAddress && isProduction() && !env().ALLOW_CHECKOUT_WITHOUT_CLIENT_IP) {
    console.error(
      "[checkout] refused: client address unknown. Set TRUSTED_PROXY_HOPS to the reverse proxies in front of the app (or ALLOW_CHECKOUT_WITHOUT_CLIENT_IP=true).",
    );
    throw new InvalidStateError("errors.checkout.temporarilyUnavailable");
  }
  // A retry of an attempt already placed is not a new order: it is not counted.
  const placedBefore = await db.order.findUnique({
    where: { storeId_idempotencyKey: { storeId: store.storeId, idempotencyKey: input.idempotencyKey } },
    select: { id: true },
  });
  // Without a trusted client address (TRUSTED_PROXY_HOPS) there is nothing to
  // count per client — never one shared bucket; the per-phone limit still applies.
  if (ctx.meta.ipAddress && !placedBefore) await consumeThrottle(CHECKOUT_THROTTLE, ctx.meta.ipAddress);
  // Release stock held by orders nobody reviewed in time before competing for it.
  await expireOverdueOrders().catch((error: unknown) => {
    console.error("[checkout] expiring overdue orders failed", error instanceof Error ? error.message : error);
  });

  const hash = requestHash(store, input.lines, details);
  const reviewHours = env().ORDER_REVIEW_HOURS;

  return db.$transaction(async (tx) => {
    // A retry of the same attempt waits here until the first one has finished.
    await lockPostingKey(tx, `checkout:${store.storeId}:${input.idempotencyKey}`);
    const existing = await tx.order.findUnique({
      where: { storeId_idempotencyKey: { storeId: store.storeId, idempotencyKey: input.idempotencyKey } },
      select: { id: true, orderNumber: true, requestHash: true },
    });
    if (existing) {
      if (existing.requestHash !== hash) throw new ConflictError("errors.checkout.keyReused");
      return {
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        accessToken: orderAccessToken(existing.id),
        replayed: true,
      };
    }

    // Concurrent checkouts of one number wait here, so the count below is exact.
    await lockPostingKey(tx, `checkout-phone:${details.phone}`);
    const openOrders = await tx.order.count({ where: { customerPhone: details.phone, status: "PENDING_REVIEW" } });
    if (openOrders >= MAX_OPEN_ORDERS_PER_PHONE) {
      throw new InvalidStateError("errors.checkout.tooManyOpenOrders", { max: MAX_OPEN_ORDERS_PER_PHONE });
    }

    const variants = await loadSellableVariants(
      tx,
      store.countryCode,
      input.lines.map((line) => line.variantId),
    );
    const problems = new Map<string, LineProblem>();
    const priced = input.lines.map((line) => {
      const variant = variants.get(line.variantId);
      if (!variant) {
        problems.set(line.variantId, "UNAVAILABLE");
        return null;
      }
      const unitPrice = variant.prices[0]!.amount.toFixed(store.minorUnits);
      if (line.expectedUnitPrice !== undefined && compareDecimalStrings(line.expectedUnitPrice, unitPrice) !== 0) {
        problems.set(line.variantId, "PRICE_CHANGED");
      }
      return { line, variant, unitPrice, lineTotal: multiplyMoney(unitPrice, line.quantity, store.minorUnits) };
    });
    if (problems.size > 0) throw new CartChangedError(problems);
    const lines = priced.map((entry) => entry!);
    const subtotal = sumMoney(
      lines.map((entry) => entry.lineTotal),
      store.minorUnits,
    );
    const itemCount = lines.reduce((sum, entry) => sum + entry.line.quantity, 0);
    const placedAt = new Date();

    const order = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx, store.countryCode),
        storeId: store.storeId,
        legalEntityId: store.legalEntityId,
        countryCode: store.countryCode,
        currencyCode: store.currencyCode,
        warehouseId: store.warehouseId,
        locale: input.locale,
        customerName: details.name,
        customerPhone: details.phone,
        customerEmail: details.email,
        shipCountryCode: store.countryCode,
        shipRegion: details.address.region,
        shipCity: details.address.city!,
        shipDistrict: details.address.district,
        shipStreet: details.address.street!,
        shipBuildingNumber: details.address.buildingNumber,
        shipUnit: details.address.unit,
        shipPostalCode: details.address.postalCode,
        shipShortAddress: details.address.shortAddress,
        shipAdditional: details.address.additional,
        deliveryNotes: details.deliveryNotes,
        itemCount,
        subtotal,
        pricesIncludeTax: store.pricesIncludeTax,
        placedAt,
        reviewDueAt: reviewHours > 0 ? new Date(placedAt.getTime() + reviewHours * 3_600_000) : null,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
      },
      select: { id: true, orderNumber: true },
    });
    const items = await tx.orderItem.createManyAndReturn({
      data: lines.map((entry, index) => ({
        orderId: order.id,
        lineNo: index + 1,
        variantId: entry.variant.id,
        productId: entry.variant.product.id,
        sku: entry.variant.sku,
        productNameEn: entry.variant.product.nameEn,
        productNameAr: entry.variant.product.nameAr,
        brandNameEn: entry.variant.product.brand.nameEn,
        brandNameAr: entry.variant.product.brand.nameAr,
        variantNameEn: entry.variant.nameEn,
        variantNameAr: entry.variant.nameAr,
        sizeMl: entry.variant.sizeMl,
        isTester: entry.variant.isTester,
        quantity: entry.line.quantity,
        unitPrice: entry.unitPrice,
        lineTotal: entry.lineTotal,
      })),
      select: { id: true, variantId: true, quantity: true },
    });

    const reserved = await reserveStock(tx, {
      orderId: order.id,
      warehouseId: store.warehouseId,
      lines: items.map((item) => ({ orderItemId: item.id, variantId: item.variantId, quantity: item.quantity })),
    });
    if (!reserved.ok) {
      throw new CartChangedError(
        new Map(
          reserved.shortfalls.map((shortfall) => [
            shortfall.variantId,
            shortfall.available === 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK",
          ]),
        ),
      );
    }

    await tx.orderStatusChange.create({
      data: { orderId: order.id, toStatus: "PENDING_REVIEW", actorType: "SYSTEM", reason: "Placed on the storefront" },
    });
    await recordAudit(tx, ctx, {
      action: "orders.order.place",
      entityType: "order",
      entityId: order.id,
      summary: `Order ${order.orderNumber} placed: ${itemCount} item(s), ${subtotal} ${store.currencyCode}`,
      after: {
        orderNumber: order.orderNumber,
        status: "PENDING_REVIEW",
        paymentStatus: "UNPAID",
        storeId: store.storeId,
        itemCount,
        subtotal,
        currencyCode: store.currencyCode,
      },
    });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      accessToken: orderAccessToken(order.id),
      replayed: false,
    };
  });
}

/**
 * What the customer sees after placing an order: only with a valid access
 * token (from their cookie) and for ORDER_ACCESS_DAYS days. A guessed or
 * sequential order number alone returns null, exactly like a missing order.
 */
export async function getOrderConfirmation(orderNumber: string, tokens: readonly string[]) {
  if (!/^[A-Z]{2}-\d{6,}$/.test(orderNumber) || tokens.length === 0) return null;
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      placedAt: true,
      status: true,
      paymentStatus: true,
      countryCode: true,
      currencyCode: true,
      locale: true,
      customerName: true,
      customerPhone: true,
      shipRegion: true,
      shipCity: true,
      shipDistrict: true,
      shipStreet: true,
      shipBuildingNumber: true,
      shipUnit: true,
      shipPostalCode: true,
      shipShortAddress: true,
      shipAdditional: true,
      itemCount: true,
      subtotal: true,
      shippingFee: true,
      total: true,
      pricesIncludeTax: true,
      country: { select: { currency: { select: { minorUnits: true } } } },
      store: { select: { nameEn: true, nameAr: true, phone: true, email: true } },
      items: {
        orderBy: { lineNo: "asc" },
        select: {
          lineNo: true,
          productNameEn: true,
          productNameAr: true,
          brandNameEn: true,
          brandNameAr: true,
          variantNameEn: true,
          variantNameAr: true,
          sizeMl: true,
          isTester: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
    },
  });
  if (!order || !hasOrderAccess(order.id, tokens)) return null;
  if (Date.now() - order.placedAt.getTime() > ORDER_ACCESS_DAYS * 86_400_000) return null;
  const minorUnits = order.country.currency.minorUnits;
  const { id: _id, country: _country, customerPhone, ...rest } = order;
  return {
    ...rest,
    /** Last three digits only: the page may be on a shared screen. */
    customerPhoneMasked: `•••${customerPhone.slice(-3)}`,
    minorUnits,
    subtotal: order.subtotal.toFixed(minorUnits),
    shippingFee: order.shippingFee?.toFixed(minorUnits) ?? null,
    total: order.total?.toFixed(minorUnits) ?? null,
    items: order.items.map((item) => ({
      ...item,
      sizeMl: item.sizeMl?.toString() ?? null,
      unitPrice: item.unitPrice.toFixed(minorUnits),
      lineTotal: item.lineTotal.toFixed(minorUnits),
    })),
  };
}

export type OrderConfirmation = NonNullable<Awaited<ReturnType<typeof getOrderConfirmation>>>;
