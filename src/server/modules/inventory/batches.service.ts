import "server-only";
import { normalizeSku } from "@/lib/catalog-text";
import {
  addDays,
  batchEligibility,
  canTransition,
  compareFefo,
  expiryState,
  localDateIn,
  releaseNeedsVerification,
  type Eligibility,
  type ExpiryState,
  type ParsedExpiry,
} from "@/lib/inventory/batches";
import {
  batchDetailsSchema,
  batchListQuerySchema,
  batchStatusChangeSchema,
  batchVerificationSchema,
  type BatchListQuery,
} from "@/lib/schemas/inventory";
import { vmsg } from "@/lib/validation/zod";
import { recordAudit } from "@/server/audit/audit";
import type { ServiceContext } from "@/server/context";
import { db, type DbClient, type Prisma, type Tx } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from "@/server/errors";
import { findVariantByCode } from "@/server/modules/catalog/products.service";
import { assertCan, can, scopeFilterFor } from "@/server/rbac/authorize";
import type { PermissionKey } from "@/server/rbac/permissions";
import { scopeFilterIsEmpty } from "@/server/rbac/scope";
import { parseId, parseInput } from "@/server/validation";
import { lockPostingKey, postStockMovements, type StockMovementLine } from "./ledger";

/**
 * Batches (ADR-023, DR-001…DR-010). A batch is one lot of one variant owned by
 * one company. Its sale eligibility is derived from three stored facts —
 * inspection status, expiry basis and verification — by `batchEligibility`;
 * every path that sells, reserves or fulfils stock must ask this module
 * (`sellableQuantity`, `isBatchEligible`), never the raw balances.
 *
 * Decisions (verify, release, quarantine, reject, correct) lock the batch row
 * FOR UPDATE before any balance. Ledger postings lock batch rows FOR SHARE
 * first, so everything touching a batch's stock is serialised by that row.
 */

export const BATCH_PAGE_SIZE = 50;
const MANAGE: PermissionKey = "inventory.batches.manage";

export function dateText(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

type EligibilityFields = {
  inspectionStatus: Parameters<typeof batchEligibility>[0]["inspectionStatus"];
  expiryBasis: Parameters<typeof batchEligibility>[0]["expiryBasis"];
  expiresOn: Date | null;
  verificationResult: Parameters<typeof batchEligibility>[0]["verificationResult"];
};

export function eligibilityOf(batch: EligibilityFields, today: string): Eligibility {
  return batchEligibility({ ...batch, expiresOn: dateText(batch.expiresOn) }, today);
}

function warehouseTarget(warehouse: { id: string; countryCode: string; legalEntityId: string }) {
  return { countryCode: warehouse.countryCode, legalEntityId: warehouse.legalEntityId, warehouseId: warehouse.id };
}

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

// ─── Shared eligibility (every stock-consuming path uses these) ─────────────

/** May stock of `batchId` be sold, reserved or fulfilled from `warehouseId` now? */
export async function isBatchEligible(client: DbClient, batchId: string, warehouseId: string) {
  const [batch, warehouse] = await Promise.all([
    client.stockBatch.findUnique({
      where: { id: batchId },
      select: { inspectionStatus: true, expiryBasis: true, expiresOn: true, verificationResult: true },
    }),
    client.warehouse.findUnique({ where: { id: warehouseId }, select: { timezone: true } }),
  ]);
  if (!batch || !warehouse) return { eligible: false as const, reason: "NOT_RELEASED" as const };
  return eligibilityOf(batch, localDateIn(warehouse.timezone, new Date()));
}

/**
 * Units of a variant that may be sold from a warehouse now: unreserved
 * SELLABLE stock without a batch or of an eligible batch (ADR-023, DR-010).
 */
export async function sellableQuantity(client: DbClient, variantId: string, warehouseId: string) {
  const warehouse = await client.warehouse.findUnique({ where: { id: warehouseId }, select: { timezone: true } });
  if (!warehouse) return 0;
  const today = localDateIn(warehouse.timezone, new Date());
  const balances = await client.stockBalance.findMany({
    where: { variantId, warehouseId, status: "SELLABLE" },
    select: {
      onHand: true,
      reserved: true,
      batch: { select: { inspectionStatus: true, expiryBasis: true, expiresOn: true, verificationResult: true } },
    },
  });
  return balances.reduce(
    (sum, row) => (!row.batch || eligibilityOf(row.batch, today).eligible ? sum + (row.onHand - row.reserved) : sum),
    0,
  );
}

// ─── Creation (opening balances now, goods receipts in PUR-002) ──────────────

export type NewBatchInput = {
  legalEntityId: string;
  countryCode: string;
  variant: { id: string; sku: string; trackExpiry: boolean };
  lotNumber: string;
  manufacturedOn: string | null;
  expiresOn: ParsedExpiry | null;
  supplierId?: string | null;
  /** RELEASED only when the caller has checked `inventory.batches.manage`. */
  initialStatus: "PENDING_INSPECTION" | "RELEASED";
  reason: string;
};

/**
 * Find the company's batch with this lot, or create it. Details given for an
 * existing batch must match it: a different date is a conflict, never a silent
 * change (corrections go through `correctBatchDetails`).
 */
export async function findOrCreateBatch(tx: Tx, ctx: ServiceContext, input: NewBatchInput) {
  await lockPostingKey(tx, `batch-lot:${input.legalEntityId}:${input.variant.id}:${input.lotNumber}`);
  const existing = await tx.stockBatch.findUnique({
    where: {
      legalEntityId_variantId_lotNumber: {
        legalEntityId: input.legalEntityId,
        variantId: input.variant.id,
        lotNumber: input.lotNumber,
      },
    },
  });
  if (existing) {
    const mismatch: Record<string, string[]> = {};
    if (input.manufacturedOn && input.manufacturedOn !== dateText(existing.manufacturedOn)) {
      mismatch.manufacturedOn = ["errors.inventory.batchDetailsDiffer"];
    }
    if (
      input.expiresOn &&
      (input.expiresOn.date !== dateText(existing.expiresOn) || input.expiresOn.precision !== existing.expiryPrecision)
    ) {
      mismatch.expiresOn = ["errors.inventory.batchDetailsDiffer"];
    }
    if (Object.keys(mismatch).length > 0) throw new ValidationError(mismatch);
    return { batch: existing, created: false };
  }

  if (input.variant.trackExpiry && !input.expiresOn) {
    throw new ValidationError({ expiresOn: ["errors.inventory.expiryRequired"] });
  }
  if (input.manufacturedOn && input.expiresOn && input.expiresOn.date <= input.manufacturedOn) {
    throw new ValidationError({ expiresOn: [vmsg("expiryAfterManufacture")] });
  }
  const actorId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const released = input.initialStatus === "RELEASED";
  const batch = await tx.stockBatch.create({
    data: {
      legalEntityId: input.legalEntityId,
      countryCode: input.countryCode,
      variantId: input.variant.id,
      lotNumber: input.lotNumber,
      manufacturedOn: toDate(input.manufacturedOn),
      expiryBasis: input.expiresOn ? "RECORDED" : "NOT_TRACKED",
      expiresOn: toDate(input.expiresOn?.date ?? null),
      expiryPrecision: input.expiresOn?.precision ?? null,
      supplierId: input.supplierId ?? null,
      inspectionStatus: input.initialStatus,
      statusReason: released ? input.reason.slice(0, 500) : null,
      statusChangedAt: released ? new Date() : null,
      statusChangedById: released ? actorId : null,
      createdById: actorId,
    },
  });
  await recordAudit(tx, ctx, {
    action: "inventory.batch.create",
    entityType: "stock_batch",
    entityId: batch.id,
    summary: `${input.variant.sku} · ${input.lotNumber}`,
    after: auditView(batch),
    reason: input.reason,
  });
  return { batch, created: true };
}

function auditView(batch: {
  lotNumber: string | null;
  manufacturedOn: Date | null;
  expiryBasis: string;
  expiresOn: Date | null;
  expiryPrecision: string | null;
  supplierId: string | null;
  inspectionStatus: string;
  verificationResult: string;
  physicalCheckOk: boolean | null;
  labelCheckOk: boolean | null;
  verificationNotes: string | null;
  detailsComplete: boolean;
  version: number;
}) {
  return {
    lotNumber: batch.lotNumber,
    manufacturedOn: dateText(batch.manufacturedOn),
    expiryBasis: batch.expiryBasis,
    expiresOn: dateText(batch.expiresOn),
    expiryPrecision: batch.expiryPrecision,
    supplierId: batch.supplierId,
    inspectionStatus: batch.inspectionStatus,
    verificationResult: batch.verificationResult,
    physicalCheckOk: batch.physicalCheckOk,
    labelCheckOk: batch.labelCheckOk,
    verificationNotes: batch.verificationNotes,
    detailsComplete: batch.detailsComplete,
    version: batch.version,
  };
}

// ─── Decisions ───────────────────────────────────────────────────────────────

type LockedBatch = Prisma.StockBatchGetPayload<{
  include: { variant: { select: { sku: true; trackExpiry: true } } };
}>;

type Holding = { id: string; code: string; countryCode: string; legalEntityId: string; timezone: string };

/**
 * Lock the batch, check the actor may decide on it everywhere it is held, and
 * check the version the user saw. Returns `replay` when the same user's
 * identical change was just applied (a double submit).
 */
async function lockForDecision(
  tx: Tx,
  ctx: ServiceContext,
  batchId: string,
  version: number,
  isReplay: (batch: LockedBatch) => boolean,
): Promise<{ batch: LockedBatch; holdings: Holding[]; replay: boolean }> {
  await tx.$queryRaw`SELECT 1 AS locked FROM "stock_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE`;
  const batch = await tx.stockBatch.findUnique({
    where: { id: batchId },
    include: { variant: { select: { sku: true, trackExpiry: true } } },
  });
  if (!batch) throw new NotFoundError("stock_batch");
  const holdings = await tx.warehouse.findMany({
    where: { stockBalances: { some: { batchId } } },
    select: { id: true, code: true, countryCode: true, legalEntityId: true, timezone: true },
    orderBy: { code: "asc" },
  });
  if (holdings.length === 0) {
    assertCan(ctx.actor, MANAGE, { countryCode: batch.countryCode, legalEntityId: batch.legalEntityId });
  }
  for (const warehouse of holdings) assertCan(ctx.actor, MANAGE, warehouseTarget(warehouse));

  if (batch.version !== version) {
    if (batch.version === version + 1 && isReplay(batch)) return { batch, holdings, replay: true };
    throw new ConflictError("errors.conflict.batchVersion");
  }
  return { batch, holdings, replay: false };
}

async function countryToday(tx: Tx, countryCode: string): Promise<string> {
  const country = await tx.country.findUniqueOrThrow({ where: { code: countryCode }, select: { timezone: true } });
  return localDateIn(country.timezone, new Date());
}

/** Is the batch known to be expired in any warehouse holding it (or its country if none)? */
async function knownExpired(tx: Tx, batch: LockedBatch, holdings: Holding[], expiresOn: Date | null) {
  const probe = { expiryBasis: expiresOn ? ("RECORDED" as const) : batch.expiryBasis, expiresOn: dateText(expiresOn) };
  const days =
    holdings.length > 0
      ? holdings.map((warehouse) => localDateIn(warehouse.timezone, new Date()))
      : [await countryToday(tx, batch.countryCode)];
  return days.some((today) => expiryState(probe, today) === "EXPIRED");
}

/**
 * Move the batch's stock between SELLABLE and QUARANTINED for an inspection
 * decision, through the ledger, in the caller's transaction.
 * - to QUARANTINED: all unreserved SELLABLE stock;
 * - to SELLABLE: QUARANTINED stock except units that were already quarantined
 *   before INV-002 (carried over by BATCH_ASSIGNMENT; nobody knows why).
 */
async function moveForDecision(
  tx: Tx,
  ctx: ServiceContext,
  batch: LockedBatch,
  direction: "toQuarantine" | "toSellable",
  key: string,
  reason: string,
): Promise<number> {
  const from = direction === "toQuarantine" ? "SELLABLE" : "QUARANTINED";
  const to = direction === "toQuarantine" ? "QUARANTINED" : "SELLABLE";
  const balances = await tx.$queryRaw<Array<{ warehouse_id: string; on_hand: number; reserved: number }>>`
    SELECT "warehouse_id", "on_hand", "reserved" FROM "stock_balances"
     WHERE "batch_id" = ${batch.id}::uuid AND "status" = ${from}::"StockStatus"
     ORDER BY "warehouse_id"
       FOR UPDATE`;
  let carried = new Map<string, number>();
  if (direction === "toSellable") {
    const rows = await tx.stockMovement.groupBy({
      by: ["warehouseId"],
      where: { batchId: batch.id, status: "QUARANTINED", type: "BATCH_ASSIGNMENT", quantity: { gt: 0 } },
      _sum: { quantity: true },
    });
    carried = new Map(rows.map((row) => [row.warehouseId, row._sum.quantity ?? 0]));
  }
  const lines: StockMovementLine[] = [];
  let moved = 0;
  for (const balance of balances) {
    const quantity = Math.max(0, balance.on_hand - balance.reserved - (carried.get(balance.warehouse_id) ?? 0));
    if (quantity === 0) continue;
    moved += quantity;
    const base = { variantId: batch.variantId, warehouseId: balance.warehouse_id, batchId: batch.id };
    lines.push({ ...base, status: from, quantity: -quantity }, { ...base, status: to, quantity });
  }
  if (lines.length > 0) {
    await postStockMovements(tx, ctx, {
      type: "INSPECTION",
      idempotencyKey: key,
      document: { type: "stock_batch", id: batch.id },
      reason,
      lines,
    });
  }
  return moved;
}

export type BatchActionResult = { version: number; replayed: boolean };

/**
 * Record a physical-condition and label check (DR-010). Never releases or
 * otherwise makes the batch sellable. A failed check moves the batch to
 * QUARANTINED or REJECTED in the same transaction.
 */
export async function verifyBatch(ctx: ServiceContext, input: unknown): Promise<BatchActionResult> {
  assertCan(ctx.actor, MANAGE);
  if (ctx.actor.kind !== "user") throw new InvalidStateError("errors.invalidState.batchVerifierRequired");
  const userId = ctx.actor.userId;
  const data = parseInput(batchVerificationSchema, input);
  const passed = data.physicalCheckOk && data.labelCheckOk;

  return db.$transaction(async (tx) => {
    const { batch, holdings, replay } = await lockForDecision(
      tx,
      ctx,
      data.batchId,
      data.version,
      (current) => current.verifiedById === userId && current.verificationResult === (passed ? "PASSED" : "FAILED"),
    );
    if (replay) return { version: batch.version, replayed: true };
    if (batch.inspectionStatus === "REJECTED") throw new InvalidStateError("errors.invalidState.batchRejected");

    // Expiry outcome — never inferred, never downgraded from a recorded date.
    let expiry: {
      expiryBasis: LockedBatch["expiryBasis"];
      expiresOn: Date | null;
      expiryPrecision: "DAY" | "MONTH" | null;
    };
    if (data.expiryOutcome === "DATE") {
      expiry = {
        expiryBasis: "RECORDED",
        expiresOn: toDate(data.expiresOn!.date),
        expiryPrecision: data.expiresOn!.precision,
      };
    } else {
      if (batch.expiryBasis === "RECORDED") throw new InvalidStateError("errors.invalidState.expiryAlreadyRecorded");
      if (data.expiryOutcome === "NOT_APPLICABLE" && batch.variant.trackExpiry) {
        throw new InvalidStateError("errors.invalidState.expiryTracked", { sku: batch.variant.sku });
      }
      expiry = {
        expiryBasis: data.expiryOutcome === "NOT_APPLICABLE" ? "NOT_TRACKED" : "UNKNOWN",
        expiresOn: null,
        expiryPrecision: null,
      };
    }
    if (expiry.expiresOn && batch.manufacturedOn && expiry.expiresOn <= batch.manufacturedOn) {
      throw new ValidationError({ expiresOn: [vmsg("expiryAfterManufacture")] });
    }

    let lotNumber = batch.lotNumber;
    if (data.lotNumber && data.lotNumber !== batch.lotNumber) {
      if (!batch.isLegacy) throw new InvalidStateError("errors.invalidState.lotNumberFixed");
      await assertLotFree(tx, batch, data.lotNumber);
      lotNumber = data.lotNumber;
    }

    // A failed check takes the batch out of sale now (DR-010 rule 6).
    let inspectionStatus: LockedBatch["inspectionStatus"] = batch.inspectionStatus;
    let moved = 0;
    if (!passed) {
      const target = data.onFailure!;
      if (target !== batch.inspectionStatus) {
        // A released batch is quarantined first; it is never rejected directly.
        if (!canTransition(batch.inspectionStatus, target)) {
          throw new InvalidStateError("errors.invalidState.transition", { from: batch.inspectionStatus, to: target });
        }
        inspectionStatus = target;
        moved = await moveForDecision(
          tx,
          ctx,
          batch,
          "toQuarantine",
          `batch:${batch.id}:verify:v${batch.version}`,
          data.reason,
        );
      }
    }
    const now = new Date();
    const statusChanged = inspectionStatus !== batch.inspectionStatus;
    const updated = await tx.stockBatch.update({
      where: { id: batch.id },
      data: {
        ...expiry,
        lotNumber,
        detailsComplete: batch.isLegacy ? lotNumber !== null : true,
        verificationResult: passed ? "PASSED" : "FAILED",
        physicalCheckOk: data.physicalCheckOk,
        labelCheckOk: data.labelCheckOk,
        verificationNotes: data.notes,
        verifiedAt: now,
        verifiedById: userId,
        inspectionStatus,
        ...(statusChanged
          ? { statusReason: data.reason.slice(0, 500), statusChangedAt: now, statusChangedById: userId }
          : {}),
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, ctx, {
      action: "inventory.batch.verify",
      entityType: "stock_batch",
      entityId: batch.id,
      summary: `${batch.variant.sku} · ${batch.lotNumber ?? "LEGACY"}: ${passed ? "PASSED" : "FAILED"}${
        statusChanged ? ` → ${inspectionStatus}` : ""
      }${moved > 0 ? ` (${moved} units quarantined)` : ""}`,
      before: auditView(batch),
      after: { ...auditView(updated), warehouses: holdings.map((warehouse) => warehouse.code) },
      reason: data.reason,
    });
    return { version: updated.version, replayed: false };
  });
}

async function assertLotFree(tx: Tx, batch: LockedBatch, lotNumber: string) {
  const taken = await tx.stockBatch.findUnique({
    where: {
      legalEntityId_variantId_lotNumber: { legalEntityId: batch.legalEntityId, variantId: batch.variantId, lotNumber },
    },
    select: { id: true },
  });
  // Merging two batches would silently reassign stock: that needs an adjustment (INV-003).
  if (taken) throw new ConflictError("errors.conflict.lotNumber", { lotNumber: ["errors.conflict.lotNumber"] });
}

/** Release, quarantine or reject a batch: separate, explicit, reasoned decisions (DR-002, DR-004, DR-010). */
export async function changeBatchStatus(ctx: ServiceContext, input: unknown): Promise<BatchActionResult> {
  assertCan(ctx.actor, MANAGE);
  const data = parseInput(batchStatusChangeSchema, input);
  const actorId = ctx.actor.kind === "user" ? ctx.actor.userId : null;

  return db.$transaction(async (tx) => {
    const { batch, holdings, replay } = await lockForDecision(
      tx,
      ctx,
      data.batchId,
      data.version,
      (current) => current.inspectionStatus === data.status && current.statusChangedById === actorId,
    );
    if (replay) return { version: batch.version, replayed: true };
    if (!canTransition(batch.inspectionStatus, data.status)) {
      throw new InvalidStateError("errors.invalidState.transition", { from: batch.inspectionStatus, to: data.status });
    }
    if (data.status === "RELEASED") {
      if (
        batch.verificationResult === "FAILED" ||
        (releaseNeedsVerification(batch) && batch.verificationResult !== "PASSED")
      ) {
        throw new InvalidStateError("errors.invalidState.batchNeedsVerification");
      }
      if (await knownExpired(tx, batch, holdings, batch.expiresOn)) {
        throw new InvalidStateError("errors.invalidState.batchExpired");
      }
    }

    const now = new Date();
    // Status first, so the ledger (and the database guard) see the decision.
    const updated = await tx.stockBatch.update({
      where: { id: batch.id },
      data: {
        inspectionStatus: data.status,
        statusReason: data.reason.slice(0, 500),
        statusChangedAt: now,
        statusChangedById: actorId,
        version: { increment: 1 },
      },
    });
    const key = `batch:${batch.id}:status:v${batch.version}`;
    const moved =
      data.status === "RELEASED"
        ? await moveForDecision(tx, ctx, batch, "toSellable", key, data.reason)
        : await moveForDecision(tx, ctx, batch, "toQuarantine", key, data.reason);
    await recordAudit(tx, ctx, {
      action: "inventory.batch.status",
      entityType: "stock_batch",
      entityId: batch.id,
      summary: `${batch.variant.sku} · ${batch.lotNumber ?? "LEGACY"}: ${batch.inspectionStatus} → ${data.status}${
        moved > 0 ? ` (${moved} units)` : ""
      }`,
      before: { inspectionStatus: batch.inspectionStatus, version: batch.version },
      after: { inspectionStatus: data.status, version: updated.version, unitsMoved: moved },
      reason: data.reason,
    });
    return { version: updated.version, replayed: false };
  });
}

/**
 * Correct a batch's details (DR-005): manufacturing date (empty clears),
 * expiry date (empty keeps; a recorded date is never removed), supplier of the
 * same company (empty clears), and the lot number of a LEGACY batch only.
 * Never moves stock; a corrected past expiry simply ends eligibility.
 */
export async function correctBatchDetails(ctx: ServiceContext, input: unknown): Promise<BatchActionResult> {
  assertCan(ctx.actor, MANAGE);
  const data = parseInput(batchDetailsSchema, input);

  return db.$transaction(async (tx) => {
    const { batch } = await lockForDecision(tx, ctx, data.batchId, data.version, () => false);
    const changes: Prisma.StockBatchUpdateInput = {};

    if (data.lotNumber && data.lotNumber !== batch.lotNumber) {
      if (!batch.isLegacy) throw new InvalidStateError("errors.invalidState.lotNumberFixed");
      await assertLotFree(tx, batch, data.lotNumber);
      changes.lotNumber = data.lotNumber;
      changes.detailsComplete = true;
    }
    const manufacturedOn = toDate(data.manufacturedOn);
    if (dateText(manufacturedOn) !== dateText(batch.manufacturedOn)) changes.manufacturedOn = manufacturedOn;
    let expiresOn = batch.expiresOn;
    if (
      data.expiresOn &&
      (data.expiresOn.date !== dateText(batch.expiresOn) || data.expiresOn.precision !== batch.expiryPrecision)
    ) {
      expiresOn = toDate(data.expiresOn.date);
      changes.expiryBasis = "RECORDED";
      changes.expiresOn = expiresOn;
      changes.expiryPrecision = data.expiresOn.precision;
    }
    const finalManufacture = changes.manufacturedOn !== undefined ? manufacturedOn : batch.manufacturedOn;
    if (expiresOn && finalManufacture && expiresOn <= finalManufacture) {
      throw new ValidationError({ expiresOn: [vmsg("expiryAfterManufacture")] });
    }
    if ((data.supplierId ?? null) !== batch.supplierId) {
      if (data.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: data.supplierId, legalEntityId: batch.legalEntityId },
          select: { id: true },
        });
        if (!supplier) throw new ValidationError({ supplierId: ["errors.inventory.supplierOtherCompany"] });
        changes.supplier = { connect: { id_legalEntityId: { id: supplier.id, legalEntityId: batch.legalEntityId } } };
      } else {
        changes.supplier = { disconnect: true };
      }
    }
    if (Object.keys(changes).length === 0) return { version: batch.version, replayed: false };

    const updated = await tx.stockBatch.update({
      where: { id: batch.id },
      data: { ...changes, version: { increment: 1 } },
    });
    await recordAudit(tx, ctx, {
      action: "inventory.batch.update",
      entityType: "stock_batch",
      entityId: batch.id,
      summary: `${batch.variant.sku} · ${updated.lotNumber ?? "LEGACY"}`,
      before: auditView(batch),
      after: auditView(updated),
      reason: data.reason,
    });
    return { version: updated.version, replayed: false };
  });
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export type BatchSummary = {
  id: string;
  lotNumber: string | null;
  isLegacy: boolean;
  detailsComplete: boolean;
  manufacturedOn: string | null;
  expiryBasis: LockedBatch["expiryBasis"];
  expiresOn: string | null;
  expiryPrecision: "DAY" | "MONTH" | null;
  expiryState: ExpiryState;
  inspectionStatus: LockedBatch["inspectionStatus"];
  verificationResult: LockedBatch["verificationResult"];
  eligibility: Eligibility;
};

function summarize(
  batch: Pick<
    LockedBatch,
    | "id"
    | "lotNumber"
    | "isLegacy"
    | "detailsComplete"
    | "manufacturedOn"
    | "expiryBasis"
    | "expiresOn"
    | "expiryPrecision"
    | "inspectionStatus"
    | "verificationResult"
  >,
  today: string,
): BatchSummary {
  return {
    id: batch.id,
    lotNumber: batch.lotNumber,
    isLegacy: batch.isLegacy,
    detailsComplete: batch.detailsComplete,
    manufacturedOn: dateText(batch.manufacturedOn),
    expiryBasis: batch.expiryBasis,
    expiresOn: dateText(batch.expiresOn),
    expiryPrecision: batch.expiryPrecision,
    expiryState: expiryState({ expiryBasis: batch.expiryBasis, expiresOn: dateText(batch.expiresOn) }, today),
    inspectionStatus: batch.inspectionStatus,
    verificationResult: batch.verificationResult,
    eligibility: eligibilityOf(batch, today),
  };
}

export const batchSummarySelect = {
  id: true,
  lotNumber: true,
  isLegacy: true,
  detailsComplete: true,
  manufacturedOn: true,
  expiryBasis: true,
  expiresOn: true,
  expiryPrecision: true,
  inspectionStatus: true,
  verificationResult: true,
  countryCode: true,
  createdAt: true,
} as const;

/** Today in each country's time zone (batch lists span warehouses of one company and country). */
async function todayByCountry(): Promise<Map<string, string>> {
  const countries = await db.country.findMany({ select: { code: true, timezone: true } });
  const now = new Date();
  return new Map(countries.map((country) => [country.code, localDateIn(country.timezone, now)]));
}

function expiryFilter(query: BatchListQuery, today: Map<string, string>): Prisma.StockBatchWhereInput {
  if (query.expiry === "unknown") return { expiryBasis: "UNKNOWN" };
  if (!query.expiry) return {};
  return {
    OR: [...today].map(([countryCode, day]) => ({
      countryCode,
      expiryBasis: "RECORDED" as const,
      expiresOn:
        query.expiry === "expired"
          ? { lt: toDate(day)! }
          : // "Expiring soon" excludes batches that have already expired (DR-006).
            { gte: toDate(day)!, lte: toDate(addDays(day, query.days))! },
    })),
  };
}

export type BatchListRow = BatchSummary & {
  variant: { id: string; sku: string; nameEn: string | null; nameAr: string | null };
  product: { nameEn: string; nameAr: string };
  quantities: Record<string, number>;
  warehouses: string[];
};

/** Batches with stock records in the actor's scope, in FEFO order (ADR-023). */
export async function listBatches(ctx: ServiceContext, rawQuery: unknown) {
  assertCan(ctx.actor, "inventory.view");
  const query = batchListQuerySchema.parse(rawQuery ?? {});
  const inScope = warehouseScopeWhere(ctx, "inventory.view");
  const today = await todayByCountry();
  const exact = query.q ? await findVariantByCode(db, query.q) : null;
  const text = query.q ? normalizeSku(query.q) : "";

  const where: Prisma.StockBatchWhereInput = {
    balances: { some: { warehouse: inScope, ...(query.warehouse ? { warehouseId: query.warehouse } : {}) } },
    ...(query.status ? { inspectionStatus: query.status } : {}),
    ...(query.incomplete ? { detailsComplete: false } : {}),
    AND: [
      expiryFilter(query, today),
      query.q
        ? exact
          ? { variantId: exact.id }
          : text
            ? { OR: [{ lotNumber: { contains: text } }, { variant: { sku: { contains: text } } }] }
            : {}
        : {},
    ],
  };
  const total = await db.stockBatch.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / BATCH_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const rows = await db.stockBatch.findMany({
    where,
    orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { lotNumber: "asc" }],
    skip: (page - 1) * BATCH_PAGE_SIZE,
    take: BATCH_PAGE_SIZE,
    select: {
      ...batchSummarySelect,
      variant: {
        select: {
          id: true,
          sku: true,
          nameEn: true,
          nameAr: true,
          product: { select: { nameEn: true, nameAr: true } },
        },
      },
      balances: {
        where: { warehouse: inScope },
        select: { status: true, onHand: true, warehouse: { select: { code: true } } },
      },
    },
  });

  return {
    rows: rows.map((row): BatchListRow => {
      const quantities: Record<string, number> = {};
      for (const balance of row.balances)
        quantities[balance.status] = (quantities[balance.status] ?? 0) + balance.onHand;
      return {
        ...summarize(row, today.get(row.countryCode)!),
        variant: { id: row.variant.id, sku: row.variant.sku, nameEn: row.variant.nameEn, nameAr: row.variant.nameAr },
        product: row.variant.product,
        quantities,
        warehouses: [...new Set(row.balances.map((balance) => balance.warehouse.code))].sort(),
      };
    }),
    total,
    page,
    pageCount,
    query: { ...query, page },
  };
}

/** One batch with its stock, movements and decision history within the actor's scope; null if not visible. */
export async function getBatch(ctx: ServiceContext, rawId: string) {
  assertCan(ctx.actor, "inventory.view");
  const id = parseId(rawId, "stock_batch");
  const inScope = warehouseScopeWhere(ctx, "inventory.view");
  const batch = await db.stockBatch.findUnique({
    where: { id },
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          nameEn: true,
          nameAr: true,
          trackExpiry: true,
          product: { select: { nameEn: true, nameAr: true } },
        },
      },
      supplier: { select: { id: true, code: true, nameEn: true, nameAr: true } },
      legalEntity: { select: { code: true, legalNameEn: true, legalNameAr: true } },
      verifiedBy: { select: { name: true } },
      statusChangedBy: { select: { name: true } },
    },
  });
  if (!batch) return null;
  const balances = await db.stockBalance.findMany({
    where: { batchId: id, warehouse: inScope },
    orderBy: [{ warehouse: { code: "asc" } }, { status: "asc" }],
    select: {
      status: true,
      onHand: true,
      reserved: true,
      warehouse: {
        select: {
          id: true,
          code: true,
          nameEn: true,
          nameAr: true,
          timezone: true,
          countryCode: true,
          legalEntityId: true,
        },
      },
    },
  });
  const anyBalance = await db.stockBalance.count({ where: { batchId: id } });
  if (balances.length === 0 && anyBalance > 0) return null; // held only outside the actor's scope

  const movements = await db.stockMovement.findMany({
    where: { batchId: id, warehouse: inScope },
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      postedAt: true,
      type: true,
      status: true,
      quantity: true,
      balanceAfter: true,
      reason: true,
      warehouse: { select: { code: true } },
    },
  });
  const holdingWarehouses = [...new Map(balances.map((row) => [row.warehouse.id, row.warehouse])).values()];
  const canManage =
    holdingWarehouses.length > 0
      ? anyBalance === balances.length &&
        holdingWarehouses.every((warehouse) => can(ctx.actor, MANAGE, warehouseTarget(warehouse)))
      : can(ctx.actor, MANAGE, { countryCode: batch.countryCode, legalEntityId: batch.legalEntityId });
  const showHistory = canManage || can(ctx.actor, "audit.view", "global");
  const history = showHistory
    ? await db.auditLog.findMany({
        where: { entityType: "stock_batch", entityId: id },
        orderBy: { occurredAt: "desc" },
        take: 50,
        select: { id: true, occurredAt: true, action: true, summary: true, reason: true, actorUserId: true },
      })
    : [];
  const actorIds = [...new Set(history.map((row) => row.actorUserId).filter((value): value is string => !!value))];
  const names = new Map(
    (actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : []
    ).map((user) => [user.id, user.name]),
  );
  const today = await todayByCountry();
  const now = new Date();

  return {
    batch: {
      ...summarize(batch, today.get(batch.countryCode)!),
      version: batch.version,
      legalEntity: batch.legalEntity,
      supplier: batch.supplier,
      statusReason: batch.statusReason,
      statusChangedAt: batch.statusChangedAt,
      statusChangedBy: batch.statusChangedBy?.name ?? null,
      physicalCheckOk: batch.physicalCheckOk,
      labelCheckOk: batch.labelCheckOk,
      verificationNotes: batch.verificationNotes,
      verifiedAt: batch.verifiedAt,
      verifiedBy: batch.verifiedBy?.name ?? null,
      createdAt: batch.createdAt,
    },
    variant: batch.variant,
    balances: balances.map((row) => ({
      status: row.status,
      onHand: row.onHand,
      reserved: row.reserved,
      warehouse: {
        id: row.warehouse.id,
        code: row.warehouse.code,
        nameEn: row.warehouse.nameEn,
        nameAr: row.warehouse.nameAr,
      },
      // Sellable only when the batch is eligible on that warehouse's own date.
      availableForSale:
        row.status === "SELLABLE" && eligibilityOf(batch, localDateIn(row.warehouse.timezone, now)).eligible
          ? row.onHand - row.reserved
          : 0,
    })),
    movements,
    history: history.map(({ actorUserId, ...row }) => ({
      ...row,
      actorName: actorUserId ? (names.get(actorUserId) ?? null) : null,
    })),
    canManage,
  };
}

/** Batches of a variant held in one warehouse, first-expiry-first-out (for later picking). */
export async function listBatchesFefo(client: DbClient, variantId: string, warehouseId: string) {
  const rows = await client.stockBatch.findMany({
    where: { variantId, balances: { some: { warehouseId, onHand: { gt: 0 } } } },
    select: { ...batchSummarySelect },
  });
  return rows.sort((a, b) =>
    compareFefo(
      { expiresOn: dateText(a.expiresOn), receivedAt: a.createdAt, lotNumber: a.lotNumber },
      { expiresOn: dateText(b.expiresOn), receivedAt: b.createdAt, lotNumber: b.lotNumber },
    ),
  );
}
