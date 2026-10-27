import { beforeEach, describe, expect, it } from "vitest";
import { addDays, localDateIn } from "@/lib/inventory/batches";
import { systemContext, type ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { changeBatchStatus } from "@/server/modules/inventory/batches.service";
import { postStockMovements } from "@/server/modules/inventory/ledger";
import { priceCart } from "@/server/modules/orders/cart.service";
import { getOrderConfirmation, placeOrder } from "@/server/modules/orders/checkout.service";
import { resolveOnlineStore, type OnlineStore } from "@/server/modules/orders/online-store";
import { updateStore } from "@/server/modules/organization/organization.service";
import {
  cancelOrder,
  confirmOrder,
  expireOverdueOrders,
  getOrder,
  listOrders,
} from "@/server/modules/orders/orders.service";
import { auditEntries, contextFor, createStaff, seedFixture, type Fixture } from "./fixtures";

// ORD-001 (ADR-025): cart pricing, guest checkout, reservations, confirmation
// access and order administration. Test names follow the spec's checklist.

let f: Fixture;
let saStoreId: string;
let egEntityId: string;
let egWarehouseId: string;
let egStoreId: string;
let productId: string;
/** Tracks batches and expiry; priced in SA (120.00) and EG (950.00). */
let oudId: string;
/** No batches; priced in SA only (45.50). */
let mistId: string;
/** Priced in EG only. */
let egOnlyId: string;
/** Draft product's variant, priced in SA. */
let draftVariantId: string;
let keySeq = 0;
const system = systemContext("orders-test");
const today = () => localDateIn("Asia/Riyadh", new Date());

function guestCtx(ip: string | null = "203.0.113.10"): ServiceContext {
  return {
    actor: { kind: "system", label: "storefront.checkout" },
    meta: { correlationId: `guest-${crypto.randomUUID()}`, ipAddress: ip, userAgent: "vitest" },
  };
}

beforeEach(async () => {
  f = await seedFixture();
  saStoreId = (
    await db.store.create({
      data: {
        code: "SA-ONLINE",
        legalEntityId: f.legalEntitySaId,
        countryCode: "SA",
        type: "ONLINE",
        nameEn: "Online SA",
        nameAr: "المتجر السعودي",
        timezone: "Asia/Riyadh",
        currencyCode: "SAR",
        phone: "+966110000000",
        fulfilmentWarehouseId: f.warehouseId,
      },
    })
  ).id;
  egEntityId = (
    await db.legalEntity.create({
      data: { code: "TEST-EG", countryCode: "EG", legalNameEn: "Test EG", legalNameAr: "اختبار مصر" },
    })
  ).id;
  egWarehouseId = (
    await db.warehouse.create({
      data: {
        code: "EG-WH-1",
        legalEntityId: egEntityId,
        countryCode: "EG",
        nameEn: "Cairo",
        nameAr: "القاهرة",
        timezone: "Africa/Cairo",
      },
    })
  ).id;
  egStoreId = (
    await db.store.create({
      data: {
        code: "EG-ONLINE",
        legalEntityId: egEntityId,
        countryCode: "EG",
        type: "ONLINE",
        nameEn: "Online EG",
        nameAr: "المتجر المصري",
        timezone: "Africa/Cairo",
        currencyCode: "EGP",
        fulfilmentWarehouseId: egWarehouseId,
      },
    })
  ).id;
  const brand = await db.brand.create({ data: { slug: "house", nameEn: "House", nameAr: "دار" } });
  productId = (
    await db.product.create({
      data: {
        slug: "royal-oud",
        brandId: brand.id,
        nameEn: "Royal Oud",
        nameAr: "عود ملكي",
        searchText: "royal oud",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    })
  ).id;
  oudId = (
    await db.productVariant.create({
      data: { productId, sku: "ROI-100", sizeMl: "100", trackExpiry: true },
    })
  ).id;
  mistId = (await db.productVariant.create({ data: { productId, sku: "ROI-MIST", trackBatches: false } })).id;
  egOnlyId = (await db.productVariant.create({ data: { productId, sku: "ROI-EG", trackBatches: false } })).id;
  const draft = await db.product.create({
    data: { slug: "draft", brandId: brand.id, nameEn: "Draft", nameAr: "مسودة", searchText: "draft" },
  });
  draftVariantId = (
    await db.productVariant.create({ data: { productId: draft.id, sku: "DRAFT-1", trackBatches: false } })
  ).id;
  await db.productPrice.createMany({
    data: [
      { variantId: oudId, countryCode: "SA", currencyCode: "SAR", amount: "120.00" },
      { variantId: oudId, countryCode: "EG", currencyCode: "EGP", amount: "950.00" },
      { variantId: mistId, countryCode: "SA", currencyCode: "SAR", amount: "45.50" },
      { variantId: egOnlyId, countryCode: "EG", currencyCode: "EGP", amount: "300.00" },
      { variantId: draftVariantId, countryCode: "SA", currencyCode: "SAR", amount: "10.00" },
    ],
  });
});

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected the operation to fail");
}

async function dbErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the statement to fail");
}

/** A released batch of `variantId` for the warehouse's company, expiring in `days` days. */
async function batch(options: { variantId?: string; days?: number; entity?: string; country?: string } = {}) {
  return db.stockBatch.create({
    data: {
      legalEntityId: options.entity ?? f.legalEntitySaId,
      countryCode: options.country ?? "SA",
      variantId: options.variantId ?? oudId,
      lotNumber: `LOT-${++keySeq}`,
      expiryBasis: "RECORDED",
      expiresOn: new Date(`${addDays(today(), options.days ?? 365)}T00:00:00Z`),
      expiryPrecision: "DAY",
      inspectionStatus: "RELEASED",
    },
  });
}

async function stock(
  quantity: number,
  options: {
    variantId?: string;
    batchId?: string | null;
    warehouseId?: string;
    status?: "SELLABLE" | "QUARANTINED";
  } = {},
) {
  await db.$transaction((tx) =>
    postStockMovements(tx, system, {
      type: "ADJUSTMENT",
      idempotencyKey: `stock-${++keySeq}`,
      lines: [
        {
          variantId: options.variantId ?? oudId,
          warehouseId: options.warehouseId ?? f.warehouseId,
          status: options.status ?? "SELLABLE",
          batchId: options.batchId ?? null,
          quantity,
        },
      ],
    }),
  );
}

const details = (overrides: Record<string, string> = {}) => ({
  name: "Sara Ahmed",
  phone: "0512345678",
  email: "sara@example.com",
  city: "Riyadh",
  district: "Al Olaya",
  street: "King Fahd Road",
  buildingNumber: "1234",
  postalCode: "12211",
  ...overrides,
});

/** A valid Saudi mobile number of its own, for tests that place several orders. */
const nextPhone = () => `05${String(10_000_000 + ++keySeq).slice(-8)}`;

const egDetails = (overrides: Record<string, string> = {}) => ({
  name: "Mona Ali",
  phone: "01012345678",
  region: "C",
  city: "Nasr City",
  street: "Abbas El Akkad",
  ...overrides,
});

function order(lines: Array<{ variantId: string; quantity: number; expectedUnitPrice?: string }>, extra = {}) {
  return {
    idempotencyKey: `key-${crypto.randomUUID()}`,
    locale: "ar",
    lines,
    details: details(),
    ...extra,
  };
}

async function reservedOf(variantId: string, batchId: string | null, warehouseId = f.warehouseId) {
  const row = await db.stockBalance.findFirst({ where: { variantId, warehouseId, status: "SELLABLE", batchId } });
  return row?.reserved ?? 0;
}

/** Σ ACTIVE reservations = `reserved`, for every balance. */
async function expectReservationsConsistent() {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT b."id" FROM "stock_balances" b
     WHERE b."reserved" <> COALESCE((
       SELECT SUM(r."quantity") FROM "stock_reservations" r
        WHERE r."status" = 'ACTIVE' AND r."variant_id" = b."variant_id" AND r."warehouse_id" = b."warehouse_id"
          AND b."status" = 'SELLABLE' AND r."batch_id" IS NOT DISTINCT FROM b."batch_id"), 0)`;
  expect(rows).toEqual([]);
}

async function saStore(): Promise<OnlineStore> {
  return (await resolveOnlineStore(db, "SA"))!;
}

describe("online store resolution", () => {
  it("maps a market to its one online store, company and fulfilment warehouse", async () => {
    const sa = await saStore();
    expect(sa).toMatchObject({
      storeId: saStoreId,
      legalEntityId: f.legalEntitySaId,
      currencyCode: "SAR",
      warehouseId: f.warehouseId,
    });
    expect((await resolveOnlineStore(db, "EG"))!.warehouseId).toBe(egWarehouseId);
  });

  it("is unavailable without a fulfilment warehouse, or with two active online stores", async () => {
    await db.store.update({ where: { id: egStoreId }, data: { fulfilmentWarehouseId: null } });
    expect(await resolveOnlineStore(db, "EG")).toBeNull();
    await db.store.create({
      data: {
        code: "SA-ONLINE-2",
        legalEntityId: f.legalEntitySaId,
        countryCode: "SA",
        type: "ONLINE",
        nameEn: "Second",
        nameAr: "ثاني",
        timezone: "Asia/Riyadh",
        currencyCode: "SAR",
      },
    });
    expect(await resolveOnlineStore(db, "SA")).toBeNull();
    expect((await errorOf(placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }])))).messageKey).toBe(
      "errors.checkout.unavailable",
    );
  });

  it("a fulfilment warehouse of another company is refused by the database", async () => {
    expect(
      await dbErrorOf(db.store.update({ where: { id: saStoreId }, data: { fulfilmentWarehouseId: egWarehouseId } })),
    ).toMatch(/foreign key|Foreign key/);
  });

  it("the store form only accepts a warehouse of the store's own company", async () => {
    const store = await db.store.findUniqueOrThrow({ where: { id: saStoreId } });
    const input = {
      code: store.code,
      nameEn: store.nameEn,
      nameAr: store.nameAr,
      timezone: store.timezone,
      type: store.type,
      fulfilmentWarehouseId: egWarehouseId,
    };
    const refused = await errorOf(updateStore(f.superAdmin, saStoreId, input));
    expect(refused.fieldErrors).toEqual({ fulfilmentWarehouseId: ["validation.invalidReference"] });
    await updateStore(f.superAdmin, saStoreId, { ...input, fulfilmentWarehouseId: "" });
    expect((await db.store.findUniqueOrThrow({ where: { id: saStoreId } })).fulfilmentWarehouseId).toBeNull();
    await updateStore(f.superAdmin, saStoreId, { ...input, fulfilmentWarehouseId: f.warehouseId });
    expect((await resolveOnlineStore(db, "SA"))?.warehouseId).toBe(f.warehouseId);
  });
});

describe("cart pricing", () => {
  it("prices lines from the market's price list and reports availability without stock figures", async () => {
    const b = await batch();
    await stock(5, { batchId: b.id });
    await stock(1, { variantId: mistId });
    const cart = await priceCart(db, await saStore(), [
      { variantId: oudId, quantity: 2 },
      { variantId: mistId, quantity: 3 },
      { variantId: egOnlyId, quantity: 1 },
      { variantId: draftVariantId, quantity: 1 },
    ]);
    expect(cart.currencyCode).toBe("SAR");
    expect(cart.lines.map((line) => [line.status, line.unitPrice, line.lineTotal])).toEqual([
      ["OK", "120.00", "240.00"],
      ["INSUFFICIENT_STOCK", "45.50", "136.50"],
      ["UNAVAILABLE", null, null],
      ["UNAVAILABLE", null, null],
    ]);
    expect(cart.subtotal).toBe("240.00");
    expect(cart.itemCount).toBe(2);
    expect(cart.canCheckout).toBe(false);
    expect(JSON.stringify(cart)).not.toMatch(/onHand|reserved|cost|supplier/i);
  });

  it("ignores malformed browser data instead of failing", async () => {
    const cart = await priceCart(db, await saStore(), [
      null,
      "x",
      { variantId: "not-a-uuid", quantity: 1 },
      { variantId: mistId, quantity: 999 },
      { variantId: mistId, quantity: 2 },
      { variantId: oudId, quantity: -4 },
    ]);
    expect(cart.lines.map((line) => [line.variantId, line.quantity])).toEqual([[mistId, 10]]);
    expect((await priceCart(db, await saStore(), "garbage")).lines).toEqual([]);
  });

  it("uses each market's own prices and currency (no conversion)", async () => {
    const eg = (await resolveOnlineStore(db, "EG"))!;
    await stock(3, { variantId: egOnlyId, warehouseId: egWarehouseId });
    const cart = await priceCart(db, eg, [
      { variantId: oudId, quantity: 1 },
      { variantId: egOnlyId, quantity: 1 },
      { variantId: mistId, quantity: 1 },
    ]);
    expect(cart.currencyCode).toBe("EGP");
    expect(cart.lines.map((line) => [line.status, line.unitPrice])).toEqual([
      ["OUT_OF_STOCK", "950.00"],
      ["OK", "300.00"],
      ["UNAVAILABLE", null],
    ]);
  });
});

describe("guest checkout", () => {
  it("creates an unpaid order for review with snapshots, without an account or payment", async () => {
    const b = await batch();
    await stock(5, { batchId: b.id });
    await stock(4, { variantId: mistId });
    const placed = await placeOrder(
      guestCtx(),
      "SA",
      order([
        { variantId: oudId, quantity: 2, expectedUnitPrice: "120.00" },
        { variantId: mistId, quantity: 1 },
      ]),
    );
    expect(placed.orderNumber).toBe("SA-000001");
    expect(placed.replayed).toBe(false);
    const row = await db.order.findUniqueOrThrow({ where: { id: placed.orderId }, include: { items: true } });
    expect(row).toMatchObject({
      status: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      isGuest: true,
      storeId: saStoreId,
      legalEntityId: f.legalEntitySaId,
      countryCode: "SA",
      currencyCode: "SAR",
      warehouseId: f.warehouseId,
      customerPhone: "+966512345678",
      customerEmail: "sara@example.com",
      shipCountryCode: "SA",
      shipCity: "Riyadh",
      shippingFee: null,
      total: null,
      itemCount: 3,
      pricesIncludeTax: true,
    });
    expect(row.subtotal.toFixed(2)).toBe("285.50");
    expect(row.reviewDueAt!.getTime() - row.placedAt.getTime()).toBe(48 * 3_600_000);
    expect(
      row.items
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((item) => [
          item.sku,
          item.productNameAr,
          item.quantity,
          item.unitPrice.toFixed(2),
          item.lineTotal.toFixed(2),
        ]),
    ).toEqual([
      ["ROI-100", "عود ملكي", 2, "120.00", "240.00"],
      ["ROI-MIST", "عود ملكي", 1, "45.50", "45.50"],
    ]);
    expect(await db.user.count({ where: { type: "CUSTOMER" } })).toBe(0);
    expect(await reservedOf(oudId, b.id)).toBe(2);
    expect(await reservedOf(mistId, null)).toBe(1);
    await expectReservationsConsistent();
    const [audit] = await auditEntries("orders.order.place");
    expect(audit!.entityId).toBe(placed.orderId);
    expect(JSON.stringify(audit)).not.toContain("512345678");
    expect(await db.orderStatusChange.count({ where: { orderId: placed.orderId } })).toBe(1);
  });

  it("reserves first-expiry-first-out and never touches ineligible stock", async () => {
    const late = await batch({ days: 400 });
    const early = await batch({ days: 30 });
    const expired = await batch({ days: 10 });
    await stock(2, { batchId: late.id });
    await stock(1, { batchId: early.id });
    await stock(5, { batchId: expired.id });
    // The lot expired after its stock became sellable (dates only move forward in real life).
    await db.stockBatch.update({
      where: { id: expired.id },
      data: { expiresOn: new Date(`${addDays(today(), -1)}T00:00:00Z`), version: { increment: 1 } },
    });
    const pending = await db.stockBatch.create({
      data: {
        legalEntityId: f.legalEntitySaId,
        countryCode: "SA",
        variantId: oudId,
        lotNumber: "PENDING-1",
        expiryBasis: "RECORDED",
        expiresOn: new Date(`${addDays(today(), 200)}T00:00:00Z`),
        expiryPrecision: "DAY",
      },
    });
    await stock(9, { batchId: pending.id, status: "QUARANTINED" });

    expect((await priceCart(db, await saStore(), [{ variantId: oudId, quantity: 4 }])).lines[0]!.status).toBe(
      "INSUFFICIENT_STOCK",
    );
    const refused = await errorOf(placeOrder(guestCtx(), "SA", order([{ variantId: oudId, quantity: 4 }])));
    expect(refused.fieldErrors).toEqual({ [`lines.${oudId}`]: ["INSUFFICIENT_STOCK"] });

    await placeOrder(guestCtx(), "SA", order([{ variantId: oudId, quantity: 2 }]));
    expect(await reservedOf(oudId, early.id)).toBe(1);
    expect(await reservedOf(oudId, late.id)).toBe(1);
    expect(await reservedOf(oudId, expired.id)).toBe(0);
    await expectReservationsConsistent();
  });

  it("refuses insufficient stock without creating anything or using an order number", async () => {
    await stock(1, { variantId: mistId });
    const refused = await errorOf(placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 2 }])));
    expect(refused.code).toBe("CONFLICT");
    expect(refused.messageKey).toBe("errors.checkout.cartChanged");
    expect(await db.order.count()).toBe(0);
    expect(await reservedOf(mistId, null)).toBe(0);
    const ok = await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }]));
    expect(ok.orderNumber).toBe("SA-000001");
  });

  it("refuses unpublished, other-market and changed-price lines", async () => {
    await stock(5, { variantId: mistId });
    const unavailable = await errorOf(
      placeOrder(
        guestCtx(),
        "SA",
        order([
          { variantId: draftVariantId, quantity: 1 },
          { variantId: egOnlyId, quantity: 1 },
        ]),
      ),
    );
    expect(unavailable.fieldErrors).toEqual({
      [`lines.${draftVariantId}`]: ["UNAVAILABLE"],
      [`lines.${egOnlyId}`]: ["UNAVAILABLE"],
    });
    const changed = await errorOf(
      placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1, expectedUnitPrice: "40.00" }])),
    );
    expect(changed.fieldErrors).toEqual({ [`lines.${mistId}`]: ["PRICE_CHANGED"] });
    expect(await db.order.count()).toBe(0);
  });

  it("ignores any price, total, company or status the browser sends", async () => {
    await stock(5, { variantId: mistId });
    const placed = await placeOrder(
      guestCtx(),
      "SA",
      order([{ variantId: mistId, quantity: 1, unitPrice: "0.01" } as never], {
        total: "0.01",
        storeId: egStoreId,
        legalEntityId: egEntityId,
        currencyCode: "EGP",
        status: "CONFIRMED",
        paymentStatus: "PAID",
      }),
    );
    const row = await db.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(row).toMatchObject({
      storeId: saStoreId,
      currencyCode: "SAR",
      status: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
    });
    expect(row.subtotal.toFixed(2)).toBe("45.50");
  });

  it("validates contact and address on the server, per country", async () => {
    await stock(5, { variantId: mistId });
    const invalid = await errorOf(
      placeOrder(
        guestCtx(),
        "SA",
        order([{ variantId: mistId, quantity: 1 }], {
          details: details({
            name: "",
            phone: "12345",
            email: "nope",
            district: "",
            postalCode: "12",
            shortAddress: "abc",
          }),
        }),
      ),
    );
    expect(invalid.code).toBe("VALIDATION");
    expect(Object.keys(invalid.fieldErrors!).sort()).toEqual(
      ["district", "email", "name", "phone", "postalCode", "shortAddress"].sort(),
    );
    expect(invalid.fieldErrors!.phone).toEqual(["validation.phoneSa"]);

    const egInvalid = await errorOf(
      placeOrder(
        guestCtx(),
        "EG",
        order([{ variantId: egOnlyId, quantity: 1 }], { details: egDetails({ region: "XX", phone: "0512345678" }) }),
      ),
    );
    expect(egInvalid.fieldErrors).toMatchObject({ region: ["validation.governorate"], phone: ["validation.phoneEg"] });
    expect(await db.order.count()).toBe(0);
  });

  it("keeps Egyptian orders in the Egyptian company, currency and warehouse", async () => {
    await stock(4, { variantId: egOnlyId, warehouseId: egWarehouseId });
    const b = await batch();
    await stock(5, { batchId: b.id }); // Saudi stock of the same variant
    const outOfStock = await errorOf(
      placeOrder(guestCtx(), "EG", order([{ variantId: oudId, quantity: 1 }], { details: egDetails() })),
    );
    expect(outOfStock.fieldErrors).toEqual({ [`lines.${oudId}`]: ["OUT_OF_STOCK"] });

    const placed = await placeOrder(
      guestCtx(),
      "EG",
      order([{ variantId: egOnlyId, quantity: 2 }], { locale: "en", details: egDetails() }),
    );
    expect(placed.orderNumber).toBe("EG-000001");
    const row = await db.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(row).toMatchObject({
      legalEntityId: egEntityId,
      storeId: egStoreId,
      currencyCode: "EGP",
      warehouseId: egWarehouseId,
      customerPhone: "+201012345678",
      shipRegion: "C",
      shipShortAddress: null,
    });
    expect(row.subtotal.toFixed(2)).toBe("600.00");
    expect(await reservedOf(oudId, b.id)).toBe(0);
  });

  it("returns the same order for a repeated submission and refuses a reused key", async () => {
    await stock(5, { variantId: mistId });
    const request = order([{ variantId: mistId, quantity: 2 }]);
    const first = await placeOrder(guestCtx(), "SA", request);
    const again = await placeOrder(guestCtx(), "SA", request);
    expect(again).toEqual({ ...first, replayed: true });
    expect(await db.order.count()).toBe(1);
    expect(await reservedOf(mistId, null)).toBe(2);

    const reused = await errorOf(
      placeOrder(guestCtx(), "SA", { ...request, lines: [{ variantId: mistId, quantity: 3 }] }),
    );
    expect(reused.messageKey).toBe("errors.checkout.keyReused");
  });

  it("handles concurrent duplicate submissions as one order", async () => {
    await stock(5, { variantId: mistId });
    const request = order([{ variantId: mistId, quantity: 1 }]);
    const results = await Promise.all([1, 2, 3].map(() => placeOrder(guestCtx(), "SA", request)));
    expect(new Set(results.map((result) => result.orderId)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await reservedOf(mistId, null)).toBe(1);
  });

  it("never sells the last unit twice under concurrent checkouts", async () => {
    const b = await batch();
    await stock(1, { batchId: b.id });
    const outcomes = await Promise.allSettled(
      [1, 2, 3, 4].map((n) =>
        placeOrder(
          guestCtx(`198.51.100.${n}`),
          "SA",
          order([{ variantId: oudId, quantity: 1 }], { details: details({ phone: nextPhone() }) }),
        ),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        expect((outcome.reason as AppError).fieldErrors).toEqual({ [`lines.${oudId}`]: ["OUT_OF_STOCK"] });
      }
    }
    expect(await db.order.count()).toBe(1);
    expect(await reservedOf(oudId, b.id)).toBe(1);
    await expectReservationsConsistent();
  });

  it("reserved units cannot be moved or sold by the ledger", async () => {
    await stock(2, { variantId: mistId });
    await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 2 }]));
    const refused = await errorOf(
      db.$transaction((tx) =>
        postStockMovements(tx, system, {
          type: "ADJUSTMENT",
          idempotencyKey: "take-reserved",
          lines: [{ variantId: mistId, warehouseId: f.warehouseId, status: "SELLABLE", quantity: -1 }],
        }),
      ),
    );
    expect(refused.messageKey).toBe("errors.invalidState.insufficientStock");
  });

  it("limits checkout attempts per client address", async () => {
    await stock(20, { variantId: mistId });
    const one = () => order([{ variantId: mistId, quantity: 1 }], { details: details({ phone: nextPhone() }) });
    const first = one();
    await placeOrder(guestCtx("192.0.2.77"), "SA", first);
    for (let i = 1; i < 8; i += 1) {
      await placeOrder(guestCtx("192.0.2.77"), "SA", one());
    }
    const limited = await errorOf(placeOrder(guestCtx("192.0.2.77"), "SA", one()));
    expect(limited.code).toBe("RATE_LIMITED");
    // A retry of an order already placed is answered, not counted.
    expect((await placeOrder(guestCtx("192.0.2.77"), "SA", first)).replayed).toBe(true);
    await placeOrder(guestCtx("192.0.2.78"), "SA", one());
    // An unknown address is not one shared bucket that would close checkout for everyone.
    for (let i = 0; i < 9; i += 1) {
      await placeOrder(guestCtx(null), "SA", one());
    }
  });

  it("limits the orders one mobile number may have awaiting review", async () => {
    await stock(10, { variantId: mistId });
    const placed = [];
    for (let i = 0; i < 3; i += 1) {
      placed.push(await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }])));
    }
    // The same number written another way is the same number.
    const refused = await errorOf(
      placeOrder(
        guestCtx("198.51.100.200"),
        "SA",
        order([{ variantId: mistId, quantity: 1 }], { details: details({ phone: "+966 51 234 5678" }) }),
      ),
    );
    expect(refused.messageKey).toBe("errors.checkout.tooManyOpenOrders");
    expect(await reservedOf(mistId, null)).toBe(3);
    await cancelOrder(f.saManager, { orderId: placed[0]!.orderId, version: 1, reason: "Duplicate" });
    await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }]));
    await placeOrder(
      guestCtx(),
      "SA",
      order([{ variantId: mistId, quantity: 1 }], { details: details({ phone: nextPhone() }) }),
    );
  });

  it("caps the units one order may hold", async () => {
    const extra = await db.productVariant.create({ data: { productId, sku: "ROI-50", trackBatches: false } });
    const sample = await db.productVariant.create({ data: { productId, sku: "ROI-5", trackBatches: false } });
    await db.productPrice.createMany({
      data: [
        { variantId: extra.id, countryCode: "SA", currencyCode: "SAR", amount: "80.00" },
        { variantId: sample.id, countryCode: "SA", currencyCode: "SAR", amount: "9.00" },
      ],
    });
    await stock(40, { variantId: mistId });
    await stock(40, { variantId: extra.id });
    await stock(5, { variantId: sample.id });
    await stock(40, { variantId: oudId, batchId: (await batch()).id });
    const thirty = [
      { variantId: mistId, quantity: 10 },
      { variantId: oudId, quantity: 10 },
      { variantId: extra.id, quantity: 10 },
    ];
    expect(await priceCart(db, await saStore(), thirty)).toMatchObject({ overUnitLimit: false, canCheckout: true });
    const thirtyOne = [...thirty, { variantId: sample.id, quantity: 1 }];
    const over = await priceCart(db, await saStore(), thirtyOne);
    expect(over).toMatchObject({ overUnitLimit: true, canCheckout: false });
    const refused = await errorOf(placeOrder(guestCtx(), "SA", order(thirtyOne)));
    expect(refused.code).toBe("VALIDATION");
    expect(await db.order.count()).toBe(0);
    await placeOrder(guestCtx(), "SA", order(thirty));
  });

  it("protects placed orders: no edits of the snapshot, no deletes, no backwards status", async () => {
    await stock(2, { variantId: mistId });
    const { orderId } = await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }]));
    expect(
      await dbErrorOf(
        db.order.update({ where: { id: orderId }, data: { subtotal: "1.00", version: { increment: 1 } } }),
      ),
    ).toMatch(/placed details cannot change/);
    expect(await dbErrorOf(db.order.delete({ where: { id: orderId } }))).toMatch(/cannot be deleted/);
    expect(
      await dbErrorOf(db.orderItem.updateMany({ where: { orderId }, data: { unitPrice: "1.00", lineTotal: "1.00" } })),
    ).toMatch(/cannot be changed/);
    expect(
      await dbErrorOf(
        db.order.update({ where: { id: orderId }, data: { status: "CONFIRMED", version: { increment: 1 } } }),
      ),
    ).toMatch(/orders_status_fields|check/i);
  });
});

describe("order confirmation access", () => {
  it("shows the order only with its access token, never by order number alone", async () => {
    await stock(2, { variantId: mistId });
    const placed = await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }]));
    const view = await getOrderConfirmation(placed.orderNumber, ["other", placed.accessToken]);
    expect(view).toMatchObject({
      orderNumber: "SA-000001",
      status: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      subtotal: "45.50",
      shippingFee: null,
      total: null,
      customerPhoneMasked: "•••678",
    });
    expect(JSON.stringify(view)).not.toContain("512345678");
    expect(await getOrderConfirmation(placed.orderNumber, [])).toBeNull();
    expect(await getOrderConfirmation(placed.orderNumber, ["x".repeat(43)])).toBeNull();

    await stock(2, { variantId: mistId });
    const second = await placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity: 1 }]));
    expect(await getOrderConfirmation(second.orderNumber, [placed.accessToken])).toBeNull();
  });
});

describe("order administration", () => {
  async function placeSaOrder(quantity = 1) {
    await stock(quantity, { variantId: mistId });
    return placeOrder(guestCtx(), "SA", order([{ variantId: mistId, quantity }]));
  }

  it("lists orders within the user's scope and masks contact details without customers.view", async () => {
    const sa = await placeSaOrder();
    await stock(1, { variantId: egOnlyId, warehouseId: egWarehouseId });
    await placeOrder(guestCtx(), "EG", order([{ variantId: egOnlyId, quantity: 1 }], { details: egDetails() }));

    const managerView = await listOrders(f.saManager, {});
    expect(managerView.rows.map((row) => row.orderNumber)).toEqual([sa.orderNumber]);
    expect(managerView.rows[0]!.customerPhone).toBe("+966512345678");
    expect((await listOrders(f.superAdmin, {})).total).toBe(2);

    const accountant = contextFor(
      await createStaff("accountant@test.local", "accountant", { type: "COUNTRY", countryCode: "SA" }),
    );
    const masked = await listOrders(accountant, {});
    expect(masked.rows[0]!.customerPhone).toBe("+966 ••••• 678");
    const detail = await getOrder(accountant, sa.orderId);
    expect(detail.contactVisible).toBe(false);
    expect(detail.address).toBeNull();
    expect(detail.customerEmail).toBeNull();

    const egManager = contextFor(
      await createStaff("manager.eg@test.local", "business_manager", { type: "COUNTRY", countryCode: "EG" }),
    );
    expect((await errorOf(getOrder(egManager, sa.orderId))).code).toBe("NOT_FOUND");
    expect((await errorOf(listOrders(f.cashier, {}))).code).toBe("FORBIDDEN");
    expect((await listOrders(f.saManager, { q: "0512345678" })).total).toBe(1);
    expect((await listOrders(f.saManager, { q: sa.orderNumber })).total).toBe(1);
    // An order number never matches phone digits of other orders ("SA-000001" is not "1").
    expect((await listOrders(f.superAdmin, { q: sa.orderNumber })).rows.map((row) => row.orderNumber)).toEqual([
      sa.orderNumber,
    ]);
  });

  it("confirms with a shipping fee, fixing the total, without marking it paid", async () => {
    const placed = await placeSaOrder(2);
    const before = await getOrder(f.saManager, placed.orderId);
    expect(before.canConfirm).toBe(true);
    const badFee = await errorOf(
      confirmOrder(f.saManager, { orderId: placed.orderId, version: before.version, shippingFee: "12.345" }),
    );
    expect(badFee.fieldErrors).toEqual({ shippingFee: ["validation.moneyPrecision"] });
    await confirmOrder(f.saManager, { orderId: placed.orderId, version: before.version, shippingFee: "25" });
    const after = await getOrder(f.saManager, placed.orderId);
    expect(after).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      shippingFee: "25.00",
      total: "116.00",
    });
    expect(after.history.map((row) => row.toStatus)).toEqual(["PENDING_REVIEW", "CONFIRMED"]);
    expect(await reservedOf(mistId, null)).toBe(2);
    expect(
      (await errorOf(confirmOrder(f.saManager, { orderId: placed.orderId, version: after.version, shippingFee: "0" })))
        .messageKey,
    ).toBe("errors.invalidState.transition");
    expect((await getOrderConfirmation(placed.orderNumber, [placed.accessToken]))!.total).toBe("116.00");
    expect(await auditEntries("orders.order.confirm")).toHaveLength(1);
  });

  it("cancelling releases the reserved stock exactly once", async () => {
    const placed = await placeSaOrder(2);
    expect(await reservedOf(mistId, null)).toBe(2);
    const stale = await errorOf(cancelOrder(f.saManager, { orderId: placed.orderId, version: 99, reason: "x" }));
    expect(stale.messageKey).toBe("errors.conflict.orderVersion");
    await cancelOrder(f.saManager, { orderId: placed.orderId, version: 1, reason: "Customer asked" });
    expect(await reservedOf(mistId, null)).toBe(0);
    const again = await errorOf(cancelOrder(f.saManager, { orderId: placed.orderId, version: 2, reason: "again" }));
    expect(again.messageKey).toBe("errors.invalidState.transition");
    expect(await reservedOf(mistId, null)).toBe(0);
    await expectReservationsConsistent();
    const detail = await getOrder(f.saManager, placed.orderId);
    expect(detail.reservations.every((row) => row.status === "RELEASED")).toBe(true);
    expect(detail.canCancel).toBe(false);
  });

  it("requires orders.update / orders.cancel at the order's scope", async () => {
    const placed = await placeSaOrder();
    const support = f.viewer; // customer_support: view only
    expect((await errorOf(confirmOrder(support, { orderId: placed.orderId, version: 1, shippingFee: "0" }))).code).toBe(
      "FORBIDDEN",
    );
    const egManager = contextFor(
      await createStaff("manager.eg@test.local", "business_manager", { type: "COUNTRY", countryCode: "EG" }),
    );
    expect((await errorOf(cancelOrder(egManager, { orderId: placed.orderId, version: 1, reason: "x" }))).code).toBe(
      "NOT_FOUND",
    );
  });

  it("will not confirm while reserved stock has become ineligible (quarantined lot)", async () => {
    const b = await batch();
    await stock(3, { batchId: b.id });
    const placed = await placeOrder(guestCtx(), "SA", order([{ variantId: oudId, quantity: 2 }]));
    const inv = contextFor(
      await createStaff("inv@test.local", "inventory_manager", { type: "COUNTRY", countryCode: "SA" }),
    );
    await changeBatchStatus(inv, { batchId: b.id, version: b.version, status: "QUARANTINED", reason: "Leak found" });
    const detail = await getOrder(f.saManager, placed.orderId);
    expect(detail.ineligibleReservationIds).toHaveLength(1);
    const refused = await errorOf(confirmOrder(f.saManager, { orderId: placed.orderId, version: 1, shippingFee: "0" }));
    expect(refused.messageKey).toBe("errors.invalidState.reservedStockIneligible");
    await cancelOrder(f.saManager, { orderId: placed.orderId, version: 1, reason: "Lot quarantined" });
    await expectReservationsConsistent();

    // The released units follow their batch into quarantine, held by its inspection (DR-011)…
    const onHand = async (status: "SELLABLE" | "QUARANTINED") =>
      (
        await db.stockBalance.findFirst({
          where: { variantId: oudId, warehouseId: f.warehouseId, batchId: b.id, status },
        })
      )?.onHand ?? 0;
    expect(await onHand("SELLABLE")).toBe(0);
    expect(await onHand("QUARANTINED")).toBe(3);
    // …so releasing the batch makes all of them sellable again.
    const current = await db.stockBatch.findUniqueOrThrow({ where: { id: b.id } });
    await changeBatchStatus(inv, {
      batchId: b.id,
      version: current.version,
      status: "RELEASED",
      reason: "Leak was the box",
    });
    expect(await onHand("SELLABLE")).toBe(3);
    expect(await onHand("QUARANTINED")).toBe(0);
  });

  it("cancels orders left unreviewed past the deadline and releases their stock", async () => {
    const overdue = await placeSaOrder(1);
    const fresh = await placeSaOrder(1);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "orders" DISABLE TRIGGER "orders_guard"');
      await tx.$executeRaw`UPDATE "orders" SET "review_due_at" = now() - interval '1 minute' WHERE "id" = ${overdue.orderId}::uuid`;
      await tx.$executeRawUnsafe('ALTER TABLE "orders" ENABLE TRIGGER "orders_guard"');
    });
    expect(await expireOverdueOrders()).toBe(1);
    expect(await expireOverdueOrders()).toBe(0);
    const expired = await db.order.findUniqueOrThrow({ where: { id: overdue.orderId } });
    expect(expired).toMatchObject({ status: "CANCELLED", cancelledById: null });
    expect((await db.order.findUniqueOrThrow({ where: { id: fresh.orderId } })).status).toBe("PENDING_REVIEW");
    expect(await reservedOf(mistId, null)).toBe(1);
    expect(await auditEntries("orders.order.expire")).toHaveLength(1);
    await expectReservationsConsistent();
  });

  it("keeps expiring other orders when one of them cannot be expired", async () => {
    const b = await batch();
    await stock(1, { batchId: b.id });
    const broken = await placeOrder(guestCtx(), "SA", order([{ variantId: oudId, quantity: 1 }]));
    const healthy = await placeSaOrder(1);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "orders" DISABLE TRIGGER "orders_guard"');
      await tx.$executeRaw`UPDATE "orders" SET "review_due_at" = now() - interval '2 minutes' WHERE "id" = ${broken.orderId}::uuid`;
      await tx.$executeRaw`UPDATE "orders" SET "review_due_at" = now() - interval '1 minute' WHERE "id" = ${healthy.orderId}::uuid`;
      await tx.$executeRawUnsafe('ALTER TABLE "orders" ENABLE TRIGGER "orders_guard"');
      // The oldest order's reserved units have gone missing: releasing them fails.
      await tx.$executeRaw`UPDATE "stock_balances" SET "reserved" = 0 WHERE "batch_id" = ${b.id}::uuid`;
    });
    expect(await expireOverdueOrders()).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: healthy.orderId } })).status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: broken.orderId } })).status).toBe("PENDING_REVIEW");
  });

  it("lets warehouse-scoped staff open the orders their list shows", async () => {
    const placed = await placeSaOrder(1);
    const picker = contextFor(
      await createStaff("picker@test.local", "sales_staff", { type: "WAREHOUSE", warehouseId: f.warehouseId }),
    );
    expect((await listOrders(picker, {})).rows.map((row) => row.orderNumber)).toEqual([placed.orderNumber]);
    expect((await getOrder(picker, placed.orderId)).orderNumber).toBe(placed.orderNumber);
    const elsewhere = contextFor(
      await createStaff("cairo@test.local", "sales_staff", { type: "WAREHOUSE", warehouseId: egWarehouseId }),
    );
    expect((await listOrders(elsewhere, {})).total).toBe(0);
    expect((await errorOf(getOrder(elsewhere, placed.orderId))).code).toBe("NOT_FOUND");
  });
});
