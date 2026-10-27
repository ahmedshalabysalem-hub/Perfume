import "server-only";
import { normalizeDigits } from "@/lib/digits";
import { env } from "@/lib/env";
import { parseMoneyInput, sumMoney } from "@/lib/money";
import {
  cancelOrderSchema,
  confirmOrderSchema,
  orderListQuerySchema,
  type OrderStatusValue,
} from "@/lib/schemas/orders";
import { recordAudit } from "@/server/audit/audit";
import { systemContext, type ServiceContext } from "@/server/context";
import { db, type Prisma, type Tx } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from "@/server/errors";
import { ineligibleReservations, releaseOrderReservations } from "@/server/modules/inventory/reservations";
import { assertCan, can, scopeFilterFor } from "@/server/rbac/authorize";
import { scopeFilterIsEmpty, type ResourceScope } from "@/server/rbac/scope";
import { parseId, parseInput } from "@/server/validation";

/**
 * Order administration for storefront orders (ORD-001, ADR-025). Staff see
 * orders of the countries, companies and stores they are scoped to
 * (`orders.view`); contact details and the delivery address additionally need
 * `customers.view` at the order's scope. The lifecycle here is the minimum the
 * storefront needs — confirm (fixing the shipping fee) and cancel (releasing
 * the reserved stock); fulfilment, shipping and payment follow in ORD-002 and
 * PAY-001. No path marks an order paid.
 */

export const ORDER_PAGE_SIZE = 50;

function orderScope(order: { countryCode: string; legalEntityId: string; storeId: string }): ResourceScope {
  return { countryCode: order.countryCode, legalEntityId: order.legalEntityId, storeId: order.storeId };
}

function orderScopeWhere(ctx: ServiceContext): Prisma.OrderWhereInput {
  const filter = scopeFilterFor(ctx.actor, "orders.view");
  if (filter.all) return {};
  if (scopeFilterIsEmpty(filter)) return { id: { in: [] } };
  return {
    OR: [
      { countryCode: { in: filter.countryCodes } },
      { legalEntityId: { in: filter.legalEntityIds } },
      { storeId: { in: filter.storeIds } },
      { warehouseId: { in: filter.warehouseIds } },
    ],
  };
}

/** "+966512345678" → "+966 ••• •• 678": enough to recognise, not to call. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, phone.startsWith("+966") ? 4 : 3)} ••••• ${phone.slice(-3)}`;
}

export async function listOrders(ctx: ServiceContext, rawQuery: unknown) {
  assertCan(ctx.actor, "orders.view", "any");
  const query = orderListQuerySchema.parse(rawQuery ?? {});
  await expireOverdueOrders().catch((error: unknown) => {
    console.error("[orders] expiring overdue orders failed", error instanceof Error ? error.message : error);
  });
  const conditions: Prisma.OrderWhereInput[] = [orderScopeWhere(ctx)];
  if (query.status) conditions.push({ status: query.status });
  if (query.country) conditions.push({ countryCode: query.country });
  if (query.q) {
    const text = normalizeDigits(query.q).trim();
    if (/^[A-Z]{2}-\d+$/i.test(text)) {
      // An order number: match it alone, never phone digits ("SA-000002" must not find every "2").
      conditions.push({ orderNumber: { contains: text.toUpperCase() } });
    } else {
      // Phone digits without the trunk zero, so "0551234567" finds "+966551234567".
      const digits = text.replace(/\D/g, "").replace(/^0+/, "");
      conditions.push({
        OR: [
          { orderNumber: { contains: text.toUpperCase() } },
          { customerName: { contains: text, mode: "insensitive" } },
          ...(digits.length >= 4 ? [{ customerPhone: { contains: digits } }] : []),
        ],
      });
    }
  }
  const where: Prisma.OrderWhereInput = { AND: conditions };
  const total = await db.order.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const rows = await db.order.findMany({
    where,
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ORDER_PAGE_SIZE,
    take: ORDER_PAGE_SIZE,
    select: {
      id: true,
      orderNumber: true,
      placedAt: true,
      status: true,
      paymentStatus: true,
      channel: true,
      isGuest: true,
      countryCode: true,
      legalEntityId: true,
      storeId: true,
      currencyCode: true,
      customerName: true,
      customerPhone: true,
      itemCount: true,
      subtotal: true,
      shippingFee: true,
      total: true,
      reviewDueAt: true,
      store: { select: { nameEn: true, nameAr: true } },
      country: { select: { currency: { select: { minorUnits: true } } } },
    },
  });
  return {
    rows: rows.map(({ customerPhone, country, ...row }) => {
      const minorUnits = country.currency.minorUnits;
      return {
        ...row,
        customerPhone: can(ctx.actor, "customers.view", orderScope(row)) ? customerPhone : maskPhone(customerPhone),
        subtotal: row.subtotal.toFixed(minorUnits),
        shippingFee: row.shippingFee?.toFixed(minorUnits) ?? null,
        total: row.total?.toFixed(minorUnits) ?? null,
      };
    }),
    total,
    page,
    pageCount,
    query: { ...query, page },
  };
}

export async function getOrder(ctx: ServiceContext, rawId: string) {
  const id = parseId(rawId, "order");
  const order = await db.order.findUnique({
    where: { id },
    include: {
      store: { select: { code: true, nameEn: true, nameAr: true } },
      warehouse: { select: { code: true, nameEn: true, nameAr: true } },
      country: { select: { nameEn: true, nameAr: true, currency: { select: { minorUnits: true } } } },
      confirmedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      items: { orderBy: { lineNo: "asc" } },
      reservations: {
        orderBy: { createdAt: "asc" },
        include: { batch: { select: { id: true, lotNumber: true, isLegacy: true, expiresOn: true } } },
      },
      history: { orderBy: { occurredAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  // Out of scope looks exactly like missing.
  if (!order || !can(ctx.actor, "orders.view", orderScope(order))) throw new NotFoundError("order");
  const minorUnits = order.country.currency.minorUnits;
  const showContact = can(ctx.actor, "customers.view", orderScope(order));
  const blocked = order.status === "PENDING_REVIEW" ? await ineligibleReservations(db, order.id) : [];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    version: order.version,
    channel: order.channel,
    isGuest: order.isGuest,
    status: order.status as OrderStatusValue,
    paymentStatus: order.paymentStatus,
    locale: order.locale,
    placedAt: order.placedAt,
    reviewDueAt: order.reviewDueAt,
    confirmedAt: order.confirmedAt,
    confirmedByName: order.confirmedBy?.name ?? null,
    cancelledAt: order.cancelledAt,
    cancelledByName: order.cancelledBy?.name ?? null,
    cancelReason: order.cancelReason,
    countryCode: order.countryCode,
    countryNameEn: order.country.nameEn,
    countryNameAr: order.country.nameAr,
    currencyCode: order.currencyCode,
    minorUnits,
    store: order.store,
    warehouse: order.warehouse,
    customerName: order.customerName,
    contactVisible: showContact,
    customerPhone: showContact ? order.customerPhone : maskPhone(order.customerPhone),
    customerEmail: showContact ? order.customerEmail : null,
    address: showContact
      ? {
          region: order.shipRegion,
          city: order.shipCity,
          district: order.shipDistrict,
          street: order.shipStreet,
          buildingNumber: order.shipBuildingNumber,
          unit: order.shipUnit,
          postalCode: order.shipPostalCode,
          shortAddress: order.shipShortAddress,
          additional: order.shipAdditional,
          deliveryNotes: order.deliveryNotes,
        }
      : null,
    itemCount: order.itemCount,
    subtotal: order.subtotal.toFixed(minorUnits),
    shippingFee: order.shippingFee?.toFixed(minorUnits) ?? null,
    total: order.total?.toFixed(minorUnits) ?? null,
    pricesIncludeTax: order.pricesIncludeTax,
    items: order.items.map((item) => ({
      id: item.id,
      lineNo: item.lineNo,
      variantId: item.variantId,
      productId: item.productId,
      sku: item.sku,
      productNameEn: item.productNameEn,
      productNameAr: item.productNameAr,
      brandNameEn: item.brandNameEn,
      brandNameAr: item.brandNameAr,
      variantNameEn: item.variantNameEn,
      variantNameAr: item.variantNameAr,
      sizeMl: item.sizeMl?.toString() ?? null,
      isTester: item.isTester,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(minorUnits),
      lineTotal: item.lineTotal.toFixed(minorUnits),
    })),
    reservations: order.reservations.map((row) => ({
      id: row.id,
      orderItemId: row.orderItemId,
      quantity: row.quantity,
      status: row.status,
      releasedAt: row.releasedAt,
      releaseReason: row.releaseReason,
      batch: row.batch
        ? {
            id: row.batch.id,
            lotNumber: row.batch.lotNumber,
            isLegacy: row.batch.isLegacy,
            expiresOn: row.batch.expiresOn?.toISOString().slice(0, 10) ?? null,
          }
        : null,
    })),
    /** Reserved units whose batch can no longer be sold; confirmation waits until resolved. */
    ineligibleReservationIds: blocked.map((row) => row.id),
    history: order.history.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      actorType: row.actorType,
      actorName: row.actor?.name ?? null,
      reason: row.reason,
      occurredAt: row.occurredAt,
    })),
    canConfirm: order.status === "PENDING_REVIEW" && can(ctx.actor, "orders.update", orderScope(order)),
    canCancel: order.status !== "CANCELLED" && can(ctx.actor, "orders.cancel", orderScope(order)),
  };
}

export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;

/** Lock an order for a decision and check the version the user saw. */
async function lockOrder(tx: Tx, orderId: string, version: number) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("order");
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { country: { select: { currency: { select: { minorUnits: true } } } } },
  });
  if (order.version !== version) throw new ConflictError("errors.conflict.orderVersion");
  return order;
}

export async function confirmOrder(ctx: ServiceContext, rawInput: unknown) {
  const input = parseInput(confirmOrderSchema, rawInput);
  return db.$transaction(async (tx) => {
    const scopeRow = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { countryCode: true, legalEntityId: true, storeId: true },
    });
    if (!scopeRow || !can(ctx.actor, "orders.view", orderScope(scopeRow))) throw new NotFoundError("order");
    assertCan(ctx.actor, "orders.update", orderScope(scopeRow));
    const order = await lockOrder(tx, input.orderId, input.version);
    if (order.status !== "PENDING_REVIEW") throw new InvalidStateError("errors.invalidState.transition");
    const minorUnits = order.country.currency.minorUnits;
    const fee = parseMoneyInput(input.shippingFee, minorUnits);
    if (!fee.ok) {
      throw new ValidationError({
        shippingFee: [
          fee.reason === "precision"
            ? "validation.moneyPrecision"
            : fee.reason === "range"
              ? "validation.moneyRange"
              : "validation.moneyFormat",
        ],
      });
    }
    if ((await ineligibleReservations(tx, order.id)).length > 0) {
      throw new InvalidStateError("errors.invalidState.reservedStockIneligible");
    }
    const subtotal = order.subtotal.toFixed(minorUnits);
    const total = sumMoney([subtotal, fee.value], minorUnits);
    const now = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMED",
        shippingFee: fee.value,
        total,
        confirmedAt: now,
        confirmedById: ctx.actor.kind === "user" ? ctx.actor.userId : null,
        version: { increment: 1 },
      },
    });
    await tx.orderStatusChange.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING_REVIEW",
        toStatus: "CONFIRMED",
        actorType: ctx.actor.kind === "user" ? "USER" : "SYSTEM",
        actorUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
      },
    });
    await recordAudit(tx, ctx, {
      action: "orders.order.confirm",
      entityType: "order",
      entityId: order.id,
      summary: `Order ${order.orderNumber} confirmed; shipping ${fee.value} ${order.currencyCode}`,
      before: { status: order.status, shippingFee: null, total: null },
      after: { status: "CONFIRMED", shippingFee: fee.value, total },
    });
    return { id: order.id };
  });
}

async function cancelLocked(
  tx: Tx,
  ctx: ServiceContext,
  order: { id: string; orderNumber: string; status: string },
  reason: string,
  kind: "staff" | "expired",
) {
  const released = await releaseOrderReservations(
    tx,
    order.id,
    kind === "expired" ? "ORDER_EXPIRED" : "ORDER_CANCELLED",
  );
  const userId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: userId,
      cancelReason: reason,
      version: { increment: 1 },
    },
  });
  await tx.orderStatusChange.create({
    data: {
      orderId: order.id,
      fromStatus: order.status as OrderStatusValue,
      toStatus: "CANCELLED",
      actorType: userId ? "USER" : "SYSTEM",
      actorUserId: userId,
      reason,
    },
  });
  await recordAudit(tx, ctx, {
    action: kind === "expired" ? "orders.order.expire" : "orders.order.cancel",
    entityType: "order",
    entityId: order.id,
    summary: `Order ${order.orderNumber} cancelled; ${released} reservation(s) released`,
    before: { status: order.status },
    after: { status: "CANCELLED" },
    reason,
  });
}

export async function cancelOrder(ctx: ServiceContext, rawInput: unknown) {
  const input = parseInput(cancelOrderSchema, rawInput);
  return db.$transaction(async (tx) => {
    const scopeRow = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { countryCode: true, legalEntityId: true, storeId: true },
    });
    if (!scopeRow || !can(ctx.actor, "orders.view", orderScope(scopeRow))) throw new NotFoundError("order");
    assertCan(ctx.actor, "orders.cancel", orderScope(scopeRow));
    const order = await lockOrder(tx, input.orderId, input.version);
    if (order.status === "CANCELLED") throw new InvalidStateError("errors.invalidState.transition");
    await cancelLocked(tx, ctx, order, input.reason, "staff");
    return { id: order.id };
  });
}

/**
 * Cancel storefront orders still unreviewed after their review deadline and
 * release their stock (ORDER_REVIEW_HOURS). Safe to run concurrently and
 * repeatedly: each order is claimed with SKIP LOCKED and re-checked.
 */
export async function expireOverdueOrders(limit = 25): Promise<number> {
  if (env().ORDER_REVIEW_HOURS === 0) return 0;
  const due = await db.order.findMany({
    where: { status: "PENDING_REVIEW", reviewDueAt: { lte: new Date() } },
    orderBy: { reviewDueAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let expired = 0;
  const ctx = systemContext("orders.expire");
  for (const { id } of due) {
    const done = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "orders"
         WHERE "id" = ${id}::uuid AND "status" = 'PENDING_REVIEW' AND "review_due_at" <= now()
           FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return false;
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { id: true, orderNumber: true, status: true },
      });
      await cancelLocked(tx, ctx, order, "Not reviewed before the review deadline", "expired");
      return true;
    });
    if (done) expired += 1;
  }
  return expired;
}
