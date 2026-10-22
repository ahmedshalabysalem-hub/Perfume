import "server-only";
import { normalizeSearchText, normalizeSku } from "@/lib/catalog-text";
import {
  movementListQuerySchema,
  openingBalanceSchema,
  stockListQuerySchema,
  type MovementListQuery,
  type StockListQuery,
} from "@/lib/schemas/inventory";
import { recordAudit } from "@/server/audit/audit";
import type { ServiceContext } from "@/server/context";
import { db, type Prisma } from "@/server/db";
import { InvalidStateError, NotFoundError, ValidationError } from "@/server/errors";
import { findVariantByCode } from "@/server/modules/catalog/products.service";
import { assertCan, can, scopeFilterFor } from "@/server/rbac/authorize";
import type { PermissionKey } from "@/server/rbac/permissions";
import { scopeFilterIsEmpty } from "@/server/rbac/scope";
import { parseInput } from "@/server/validation";
import { lockPostingKey, postStockMovements } from "./ledger";

export const STOCK_PAGE_SIZE = 50;
export const MOVEMENT_PAGE_SIZE = 50;

/** Warehouses whose stock the actor may see (or act on) with `permission`. */
function warehouseScopeWhere(ctx: ServiceContext, permission: PermissionKey): Prisma.WarehouseWhereInput {
  const filter = scopeFilterFor(ctx.actor, permission);
  if (filter.all) return {};
  if (scopeFilterIsEmpty(filter)) return { id: { in: [] } };
  return {
    OR: [
      { countryCode: { in: filter.countryCodes } },
      { legalEntityId: { in: filter.legalEntityIds } },
      { id: { in: filter.warehouseIds } },
    ],
  };
}

function warehouseTarget(warehouse: { id: string; countryCode: string; legalEntityId: string }) {
  return { countryCode: warehouse.countryCode, legalEntityId: warehouse.legalEntityId, warehouseId: warehouse.id };
}

const variantSummarySelect = {
  id: true,
  sku: true,
  barcode: true,
  nameEn: true,
  nameAr: true,
  sizeMl: true,
  product: { select: { id: true, nameEn: true, nameAr: true } },
} as const;

const warehouseSummarySelect = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  countryCode: true,
  isActive: true,
} as const;

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Warehouses for filters and forms, limited to the actor's scope. */
export async function listStockWarehouses(ctx: ServiceContext, permission: PermissionKey = "inventory.view") {
  assertCan(ctx.actor, permission);
  return db.warehouse.findMany({
    where: warehouseScopeWhere(ctx, permission),
    orderBy: [{ countryCode: "desc" }, { code: "asc" }],
    select: warehouseSummarySelect,
  });
}

export type StockRow = {
  id: string;
  status: string;
  onHand: number;
  reserved: number;
  available: number;
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    nameEn: string | null;
    nameAr: string | null;
    sizeMl: string | null;
  };
  product: { id: string; nameEn: string; nameAr: string };
  warehouse: { id: string; code: string; nameEn: string; nameAr: string };
};

export type StockListResult = {
  rows: StockRow[];
  total: number;
  page: number;
  pageCount: number;
  query: StockListQuery;
};

/** Stock overview: one row per variant × warehouse × status within the actor's scope. */
export async function listStock(ctx: ServiceContext, rawQuery: unknown): Promise<StockListResult> {
  assertCan(ctx.actor, "inventory.view");
  const query = stockListQuerySchema.parse(rawQuery ?? {});

  const exact = query.q ? await findVariantByCode(db, query.q) : null;
  const normalized = query.q ? normalizeSearchText(query.q) : "";
  const sku = query.q ? normalizeSku(query.q) : "";
  const where: Prisma.StockBalanceWhereInput = {
    warehouse: warehouseScopeWhere(ctx, "inventory.view"),
    ...(query.warehouse ? { warehouseId: query.warehouse } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? exact
        ? { variantId: exact.id }
        : {
            OR: [
              ...(sku ? [{ variant: { sku: { contains: sku } } }] : []),
              ...(normalized ? [{ variant: { product: { searchText: { contains: normalized } } } }] : []),
            ],
          }
      : {}),
  };

  const total = await db.stockBalance.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / STOCK_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const balances = await db.stockBalance.findMany({
    where,
    orderBy: [{ variant: { sku: "asc" } }, { warehouse: { code: "asc" } }, { status: "asc" }],
    skip: (page - 1) * STOCK_PAGE_SIZE,
    take: STOCK_PAGE_SIZE,
    select: {
      id: true,
      status: true,
      onHand: true,
      reserved: true,
      variant: { select: variantSummarySelect },
      warehouse: { select: { id: true, code: true, nameEn: true, nameAr: true } },
    },
  });

  return {
    rows: balances.map((balance) => ({
      id: balance.id,
      status: balance.status,
      onHand: balance.onHand,
      reserved: balance.reserved,
      available: balance.onHand - balance.reserved,
      variant: {
        id: balance.variant.id,
        sku: balance.variant.sku,
        barcode: balance.variant.barcode,
        nameEn: balance.variant.nameEn,
        nameAr: balance.variant.nameAr,
        sizeMl: balance.variant.sizeMl?.toString() ?? null,
      },
      product: balance.variant.product,
      warehouse: balance.warehouse,
    })),
    total,
    page,
    pageCount,
    query: { ...query, page },
  };
}

/** One variant's balances and movement history within the actor's scope; null if the variant does not exist. */
export async function getVariantStock(ctx: ServiceContext, variantId: string, rawQuery: unknown) {
  assertCan(ctx.actor, "inventory.view");
  const query: MovementListQuery = movementListQuerySchema.parse(rawQuery ?? {});
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { ...variantSummarySelect, trackInventory: true },
  });
  if (!variant) return null;

  const inScope = warehouseScopeWhere(ctx, "inventory.view");
  const balances = await db.stockBalance.findMany({
    where: { variantId, warehouse: inScope },
    orderBy: [{ warehouse: { code: "asc" } }, { status: "asc" }],
    select: {
      id: true,
      status: true,
      onHand: true,
      reserved: true,
      warehouse: { select: { id: true, code: true, nameEn: true, nameAr: true } },
    },
  });

  const movementWhere: Prisma.StockMovementWhereInput = {
    variantId,
    warehouse: inScope,
    ...(query.warehouse ? { warehouseId: query.warehouse } : {}),
  };
  const total = await db.stockMovement.count({ where: movementWhere });
  const pageCount = Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const movements = await db.stockMovement.findMany({
    where: movementWhere,
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * MOVEMENT_PAGE_SIZE,
    take: MOVEMENT_PAGE_SIZE,
    select: {
      id: true,
      postedAt: true,
      type: true,
      status: true,
      quantity: true,
      balanceAfter: true,
      unitCost: true,
      currencyCode: true,
      documentType: true,
      documentId: true,
      reason: true,
      actorUserId: true,
      warehouse: { select: { id: true, code: true } },
    },
  });
  const actorIds = [...new Set(movements.map((row) => row.actorUserId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));

  return {
    variant: { ...variant, sizeMl: variant.sizeMl?.toString() ?? null },
    balances: balances.map((balance) => ({ ...balance, available: balance.onHand - balance.reserved })),
    movements: movements.map(({ actorUserId, unitCost, ...row }) => ({
      ...row,
      unitCost: unitCost?.toFixed(4) ?? null,
      actorName: actorUserId ? (names.get(actorUserId) ?? null) : null,
    })),
    total,
    page,
    pageCount,
    query: { ...query, page },
  };
}

// ─── Opening balances ────────────────────────────────────────────────────────

/** Can the actor enter opening balances in at least one warehouse? */
export function canPostOpeningBalances(ctx: ServiceContext): boolean {
  return can(ctx.actor, "inventory.adjust.approve");
}

/**
 * Enter stock that existed before the system did. Allowed once per variant,
 * warehouse and stock status, and only while that balance has no ledger
 * history: later corrections are adjustments (INV-003), not new openings.
 */
export async function postOpeningBalance(ctx: ServiceContext, input: unknown): Promise<{ movementId: string }> {
  assertCan(ctx.actor, "inventory.adjust.approve");
  const data = parseInput(openingBalanceSchema, input);

  const warehouse = await db.warehouse.findUnique({
    where: { id: data.warehouseId },
    select: { id: true, code: true, countryCode: true, legalEntityId: true, isActive: true },
  });
  if (!warehouse) throw new NotFoundError("warehouse");
  assertCan(ctx.actor, "inventory.adjust.approve", warehouseTarget(warehouse));
  if (!warehouse.isActive)
    throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "warehouse" });

  const found = await findVariantByCode(db, data.variantCode);
  if (!found) throw new ValidationError({ variantCode: ["errors.inventory.variantNotFound"] });

  const idempotencyKey = `opening-balance:${found.id}:${warehouse.id}:${data.status}`;
  return db.$transaction(async (tx) => {
    // Serialise concurrent openings of the same balance before checking history.
    await lockPostingKey(tx, idempotencyKey);
    const history = await tx.stockMovement.count({
      where: { variantId: found.id, warehouseId: warehouse.id, status: data.status },
    });
    if (history > 0) throw new InvalidStateError("errors.invalidState.openingBalanceExists", { sku: found.sku });

    const { movements } = await postStockMovements(tx, ctx, {
      type: "OPENING_BALANCE",
      idempotencyKey,
      reason: data.reason,
      lines: [
        {
          variantId: found.id,
          warehouseId: warehouse.id,
          status: data.status,
          quantity: data.quantity,
          unitCost: data.unitCost,
        },
      ],
    });
    const movement = movements[0]!;
    await recordAudit(tx, ctx, {
      action: "inventory.opening_balance.post",
      entityType: "stock_movement",
      entityId: movement.id,
      summary: `${found.sku} @ ${warehouse.code}: +${data.quantity} ${data.status}`,
      after: {
        variantId: found.id,
        sku: found.sku,
        warehouseId: warehouse.id,
        status: data.status,
        quantity: data.quantity,
        unitCost: data.unitCost,
        balanceAfter: movement.balanceAfter,
      },
      reason: data.reason,
    });
    return { movementId: movement.id };
  });
}
