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
import { localDateIn } from "@/lib/inventory/batches";
import { dateText, eligibilityOf, findOrCreateBatch } from "./batches.service";
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
  /** Units that may be sold now: SELLABLE, unreserved, of an eligible batch (ADR-023). */
  availableForSale: number;
  /** Why SELLABLE units of this batch cannot be sold now; null when they can or the status says it. */
  ineligibleReason: "NOT_RELEASED" | "EXPIRED" | "EXPIRY_UNVERIFIED" | null;
  batch: { id: string; lotNumber: string | null; isLegacy: boolean } | null;
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
    orderBy: [{ variant: { sku: "asc" } }, { warehouse: { code: "asc" } }, { status: "asc" }, { batchId: "asc" }],
    skip: (page - 1) * STOCK_PAGE_SIZE,
    take: STOCK_PAGE_SIZE,
    select: {
      id: true,
      status: true,
      onHand: true,
      reserved: true,
      variant: { select: variantSummarySelect },
      warehouse: { select: { id: true, code: true, nameEn: true, nameAr: true, timezone: true } },
      batch: {
        select: {
          id: true,
          lotNumber: true,
          isLegacy: true,
          inspectionStatus: true,
          expiryBasis: true,
          expiresOn: true,
          verificationResult: true,
        },
      },
    },
  });
  const now = new Date();

  return {
    rows: balances.map((balance) => {
      const eligibility = balance.batch
        ? eligibilityOf(balance.batch, localDateIn(balance.warehouse.timezone, now))
        : null;
      return {
        id: balance.id,
        status: balance.status,
        onHand: balance.onHand,
        reserved: balance.reserved,
        available: balance.onHand - balance.reserved,
        availableForSale:
          balance.status === "SELLABLE" && (!eligibility || eligibility.eligible)
            ? balance.onHand - balance.reserved
            : 0,
        ineligibleReason:
          balance.status === "SELLABLE" && eligibility && !eligibility.eligible ? eligibility.reason : null,
        batch: balance.batch
          ? { id: balance.batch.id, lotNumber: balance.batch.lotNumber, isLegacy: balance.batch.isLegacy }
          : null,
        variant: {
          id: balance.variant.id,
          sku: balance.variant.sku,
          barcode: balance.variant.barcode,
          nameEn: balance.variant.nameEn,
          nameAr: balance.variant.nameAr,
          sizeMl: balance.variant.sizeMl?.toString() ?? null,
        },
        product: balance.variant.product,
        warehouse: {
          id: balance.warehouse.id,
          code: balance.warehouse.code,
          nameEn: balance.warehouse.nameEn,
          nameAr: balance.warehouse.nameAr,
        },
      };
    }),
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
    select: { ...variantSummarySelect, trackInventory: true, trackBatches: true },
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
      warehouse: { select: { id: true, code: true, nameEn: true, nameAr: true, timezone: true } },
      batch: {
        select: {
          id: true,
          lotNumber: true,
          isLegacy: true,
          inspectionStatus: true,
          expiryBasis: true,
          expiresOn: true,
          verificationResult: true,
        },
      },
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
      batch: { select: { id: true, lotNumber: true, isLegacy: true } },
    },
  });
  const actorIds = [...new Set(movements.map((row) => row.actorUserId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  const now = new Date();

  return {
    variant: { ...variant, sizeMl: variant.sizeMl?.toString() ?? null },
    balances: balances.map(({ batch, warehouse: { timezone, ...warehouse }, ...balance }) => {
      const eligibility = batch ? eligibilityOf(batch, localDateIn(timezone, now)) : null;
      return {
        ...balance,
        warehouse,
        batch: batch
          ? { id: batch.id, lotNumber: batch.lotNumber, isLegacy: batch.isLegacy, expiresOn: dateText(batch.expiresOn) }
          : null,
        available: balance.onHand - balance.reserved,
        /** Units that may be sold now: SELLABLE, unreserved, and of an eligible batch (ADR-023). */
        availableForSale:
          balance.status === "SELLABLE" && (!eligibility || eligibility.eligible)
            ? balance.onHand - balance.reserved
            : 0,
        ineligibleReason:
          balance.status === "SELLABLE" && eligibility && !eligibility.eligible ? eligibility.reason : null,
      };
    }),
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
 * warehouse, stock status and batch, and only while that balance has no
 * ledger history: later corrections are adjustments (INV-003), not new
 * openings. A variant that tracks batches needs a lot number; its batch is
 * found or created here (ADR-023). A new batch entered as SELLABLE starts
 * RELEASED only for a user who may release batches (DR-002); any other new
 * batch starts PENDING_INSPECTION.
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

  const code = await findVariantByCode(db, data.variantCode);
  if (!code) throw new ValidationError({ variantCode: ["errors.inventory.variantNotFound"] });
  const found = await db.productVariant.findUniqueOrThrow({
    where: { id: code.id },
    select: { id: true, sku: true, trackBatches: true, trackExpiry: true },
  });
  if (found.trackBatches && !data.lotNumber) {
    throw new ValidationError({ lotNumber: ["errors.inventory.lotRequired"] });
  }
  if (!found.trackBatches && (data.lotNumber || data.manufacturedOn || data.expiresOn)) {
    throw new ValidationError({ lotNumber: ["errors.inventory.batchNotTracked"] });
  }
  const mayRelease = can(ctx.actor, "inventory.batches.manage", warehouseTarget(warehouse));
  const lotKey = data.lotNumber ? `:${data.lotNumber}` : "";

  return db.$transaction(async (tx) => {
    // Serialise concurrent openings of the same balance before checking history.
    await lockPostingKey(tx, `opening-balance:${found.id}:${warehouse.id}:${data.status}${lotKey}`);

    let batch: { id: string; lotNumber: string | null; inspectionStatus: string } | null = null;
    if (data.lotNumber) {
      const result = await findOrCreateBatch(tx, ctx, {
        legalEntityId: warehouse.legalEntityId,
        countryCode: warehouse.countryCode,
        variant: found,
        lotNumber: data.lotNumber,
        manufacturedOn: data.manufacturedOn,
        expiresOn: data.expiresOn,
        initialStatus: data.status === "SELLABLE" && mayRelease ? "RELEASED" : "PENDING_INSPECTION",
        reason: data.reason,
      });
      batch = result.batch;
      if (data.status === "SELLABLE" && result.created && !mayRelease) {
        throw new InvalidStateError("errors.invalidState.releaseNeedsPermission");
      }
      // Quarantined opening stock counts as held for inspection (DR-011), which a released lot no
      // longer is. Locked FOR SHARE so a release cannot commit between this check and the posting.
      if (data.status === "QUARANTINED" && !result.created) {
        const [current] = await tx.$queryRaw<Array<{ inspection_status: string }>>`
          SELECT "inspection_status" FROM "stock_batches" WHERE "id" = ${batch.id}::uuid FOR SHARE`;
        if (current?.inspection_status === "RELEASED") {
          throw new InvalidStateError("errors.invalidState.openingQuarantineReleasedLot");
        }
      }
    }

    const history = await tx.stockMovement.count({
      where: { variantId: found.id, warehouseId: warehouse.id, status: data.status, batchId: batch?.id ?? null },
    });
    if (history > 0) throw new InvalidStateError("errors.invalidState.openingBalanceExists", { sku: found.sku });

    const { movements } = await postStockMovements(tx, ctx, {
      type: "OPENING_BALANCE",
      // A batch implies its variant, and keeps the key within the ledger's 120 characters.
      idempotencyKey: batch
        ? `opening-balance:${batch.id}:${warehouse.id}:${data.status}`
        : `opening-balance:${found.id}:${warehouse.id}:${data.status}`,
      reason: data.reason,
      lines: [
        {
          variantId: found.id,
          warehouseId: warehouse.id,
          status: data.status,
          batchId: batch?.id ?? null,
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
      summary: `${found.sku}${batch ? ` · ${batch.lotNumber}` : ""} @ ${warehouse.code}: +${data.quantity} ${data.status}`,
      after: {
        variantId: found.id,
        sku: found.sku,
        warehouseId: warehouse.id,
        status: data.status,
        batchId: batch?.id ?? null,
        lotNumber: batch?.lotNumber ?? null,
        batchStatus: batch?.inspectionStatus ?? null,
        quantity: data.quantity,
        unitCost: data.unitCost,
        balanceAfter: movement.balanceAfter,
      },
      reason: data.reason,
    });
    return { movementId: movement.id };
  });
}
