import "server-only";
import type { BatchInspectionStatus, BatchVerificationResult, ExpiryBasis } from "@/generated/prisma/enums";
import { batchEligibility, compareFefo, localDateIn } from "@/lib/inventory/batches";
import type { ServiceContext } from "@/server/context";
import type { DbClient, Tx } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { postStockMovements, type StockMovementLine } from "./ledger";

/**
 * Stock reservations (the INV-004 mechanism, first used by ORD-001, ADR-025).
 * A reservation holds units of one SELLABLE balance (variant, warehouse,
 * batch) for one order line: `stock_balances.reserved` goes up by the same
 * amount, so the ledger can no longer move or sell those units
 * (`on_hand - reserved`). Nothing leaves the warehouse here; shipping (ORD-002)
 * will consume reservations through the ledger.
 *
 * Only eligible stock is reserved — the same `batchEligibility` rule the
 * ledger and the database use (ADR-023): RELEASED, not expired on the
 * warehouse's local date, verified when expiry is unknown. Batches are taken
 * first-expiry-first-out.
 *
 * Lock order matches the ledger and batch decisions: batch rows FOR SHARE (by
 * id), then balance rows FOR UPDATE (by variant, then batch), so a concurrent
 * posting, reservation or inspection decision waits instead of interleaving.
 */

type LockedBatch = {
  id: string;
  lot_number: string | null;
  inspection_status: BatchInspectionStatus;
  expiry_basis: ExpiryBasis;
  expires_on: string | null;
  verification_result: BatchVerificationResult;
  created_at: Date;
};

type LockedBalance = { id: string; variant_id: string; batch_id: string | null; on_hand: number; reserved: number };

export type ReservationLine = { orderItemId: string; variantId: string; quantity: number };

export type ReservationResult =
  | { ok: true }
  /** Units that could be reserved per variant, for every line that fell short. */
  | { ok: false; shortfalls: Array<{ variantId: string; requested: number; available: number }> };

async function lockBatches(tx: Tx, batchIds: string[]): Promise<Map<string, LockedBatch>> {
  if (batchIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<LockedBatch[]>`
    SELECT "id", "lot_number", "inspection_status", "expiry_basis",
           to_char("expires_on", 'YYYY-MM-DD') AS "expires_on", "verification_result", "created_at"
      FROM "stock_batches"
     WHERE "id" = ANY(${[...batchIds].sort()}::uuid[])
     ORDER BY "id"
       FOR SHARE`;
  return new Map(rows.map((row) => [row.id, row]));
}

function isEligible(batch: LockedBatch, today: string): boolean {
  return batchEligibility(
    {
      inspectionStatus: batch.inspection_status,
      expiryBasis: batch.expiry_basis,
      expiresOn: batch.expires_on,
      verificationResult: batch.verification_result,
    },
    today,
  ).eligible;
}

/**
 * Reserve every line in full from `warehouseId`, or nothing: when any line
 * falls short the caller must roll back its transaction (no balance has been
 * changed yet in that case — shortfalls are found before any update).
 */
export async function reserveStock(
  tx: Tx,
  input: { orderId: string; warehouseId: string; lines: ReservationLine[] },
): Promise<ReservationResult> {
  const warehouse = await tx.warehouse.findUnique({
    where: { id: input.warehouseId },
    select: { timezone: true, isActive: true },
  });
  if (!warehouse) throw new NotFoundError("warehouse");
  const today = localDateIn(warehouse.timezone, new Date());
  const variantIds = [...new Set(input.lines.map((line) => line.variantId))].sort();
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, trackInventory: true, trackBatches: true },
  });
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const candidates = await tx.stockBalance.findMany({
    where: { warehouseId: input.warehouseId, status: "SELLABLE", variantId: { in: variantIds } },
    select: { batchId: true },
  });
  const batches = await lockBatches(tx, [
    ...new Set(candidates.map((row) => row.batchId).filter((id): id is string => id !== null)),
  ]);
  const balances = await tx.$queryRaw<LockedBalance[]>`
    SELECT "id", "variant_id", "batch_id", "on_hand", "reserved"
      FROM "stock_balances"
     WHERE "warehouse_id" = ${input.warehouseId}::uuid
       AND "status" = 'SELLABLE'
       AND "variant_id" = ANY(${variantIds}::uuid[])
     ORDER BY "variant_id", "batch_id" NULLS FIRST
       FOR UPDATE`;

  const allocations: Array<{ line: ReservationLine; balance: LockedBalance; quantity: number }> = [];
  const shortfalls: Array<{ variantId: string; requested: number; available: number }> = [];
  for (const line of input.lines) {
    const variant = variantById.get(line.variantId);
    const usable =
      variant && warehouse.isActive && variant.trackInventory
        ? balances
            .filter((row) => row.variant_id === line.variantId && row.on_hand - row.reserved > 0)
            .filter((row) =>
              variant.trackBatches
                ? row.batch_id !== null && batches.has(row.batch_id) && isEligible(batches.get(row.batch_id)!, today)
                : row.batch_id === null,
            )
            .sort((a, b) => {
              if (a.batch_id === null || b.batch_id === null) return 0;
              const x = batches.get(a.batch_id)!;
              const y = batches.get(b.batch_id)!;
              return compareFefo(
                { expiresOn: x.expires_on, receivedAt: x.created_at, lotNumber: x.lot_number },
                { expiresOn: y.expires_on, receivedAt: y.created_at, lotNumber: y.lot_number },
              );
            })
        : [];
    let remaining = line.quantity;
    for (const balance of usable) {
      if (remaining === 0) break;
      const take = Math.min(remaining, balance.on_hand - balance.reserved);
      allocations.push({ line, balance, quantity: take });
      remaining -= take;
    }
    if (remaining > 0) {
      shortfalls.push({ variantId: line.variantId, requested: line.quantity, available: line.quantity - remaining });
    }
  }
  if (shortfalls.length > 0) return { ok: false, shortfalls };

  for (const allocation of allocations) {
    // The rows are locked, so this cannot fail; the condition and the table's
    // CHECK (reserved <= on_hand) are the backstop.
    const updated = await tx.$executeRaw`
      UPDATE "stock_balances"
         SET "reserved" = "reserved" + ${allocation.quantity}, "updated_at" = now()
       WHERE "id" = ${allocation.balance.id}::uuid
         AND "on_hand" - "reserved" >= ${allocation.quantity}`;
    if (updated !== 1) throw new Error("reserveStock: balance changed under lock");
  }
  await tx.stockReservation.createMany({
    data: allocations.map((allocation) => ({
      orderId: input.orderId,
      orderItemId: allocation.line.orderItemId,
      variantId: allocation.line.variantId,
      warehouseId: input.warehouseId,
      batchId: allocation.balance.batch_id,
      quantity: allocation.quantity,
    })),
  });
  return { ok: true };
}

/**
 * Release every ACTIVE reservation of an order (cancellation or expiry).
 * Idempotent: an order without active reservations changes nothing.
 *
 * Units reserved from a batch that was quarantined or rejected meanwhile were
 * left SELLABLE by that decision (it moves unreserved stock only); once
 * released they follow the batch into QUARANTINED with an INSPECTION movement,
 * exactly as the decision would have moved them, so the batch's inspection
 * hold (DR-011) counts them and a later release restores them.
 */
export async function releaseOrderReservations(
  tx: Tx,
  ctx: ServiceContext,
  orderId: string,
  reason: string,
): Promise<number> {
  const active = await tx.stockReservation.findMany({
    where: { orderId, status: "ACTIVE" },
    select: { id: true, variantId: true, warehouseId: true, batchId: true, quantity: true },
  });
  if (active.length === 0) return 0;
  const batchIds = [...new Set(active.map((row) => row.batchId).filter((id): id is string => id !== null))];
  const batches = await lockBatches(tx, batchIds);
  const ordered = [...active].sort(
    (a, b) =>
      a.warehouseId.localeCompare(b.warehouseId) ||
      a.variantId.localeCompare(b.variantId) ||
      (a.batchId ?? "").localeCompare(b.batchId ?? ""),
  );
  for (const row of ordered) {
    const updated = await tx.$executeRaw`
      UPDATE "stock_balances"
         SET "reserved" = "reserved" - ${row.quantity}, "updated_at" = now()
       WHERE "variant_id" = ${row.variantId}::uuid
         AND "warehouse_id" = ${row.warehouseId}::uuid
         AND "status" = 'SELLABLE'
         AND "batch_id" IS NOT DISTINCT FROM ${row.batchId}::uuid
         AND "reserved" >= ${row.quantity}`;
    if (updated !== 1)
      throw new Error(`releaseOrderReservations: reservation ${row.id} has no matching reserved units`);
  }
  await tx.stockReservation.updateMany({
    where: { id: { in: active.map((row) => row.id) }, status: "ACTIVE" },
    data: { status: "RELEASED", releasedAt: new Date(), releaseReason: reason.slice(0, 40) },
  });

  const held: StockMovementLine[] = [];
  for (const row of ordered) {
    const batch = row.batchId ? batches.get(row.batchId) : undefined;
    if (!batch || batch.inspection_status === "RELEASED") continue;
    const base = { variantId: row.variantId, warehouseId: row.warehouseId, batchId: row.batchId };
    held.push(
      { ...base, status: "SELLABLE", quantity: -row.quantity },
      { ...base, status: "QUARANTINED", quantity: row.quantity },
    );
  }
  if (held.length > 0) {
    await postStockMovements(tx, ctx, {
      type: "INSPECTION",
      idempotencyKey: `order:${orderId}:release-held`,
      document: { type: "order", id: orderId },
      reason: "Reserved units returned to their quarantined batch",
      lines: held,
    });
  }
  return active.length;
}

/**
 * Active reservations of an order whose batch is no longer eligible for sale
 * (quarantined, rejected, expired or unverified since the order was placed).
 */
export async function ineligibleReservations(client: DbClient, orderId: string) {
  const rows = await client.stockReservation.findMany({
    where: { orderId, status: "ACTIVE", batchId: { not: null } },
    select: {
      id: true,
      quantity: true,
      variantId: true,
      warehouse: { select: { timezone: true } },
      batch: {
        select: {
          lotNumber: true,
          inspectionStatus: true,
          expiryBasis: true,
          expiresOn: true,
          verificationResult: true,
        },
      },
    },
  });
  const now = new Date();
  return rows.filter((row) => {
    const batch = row.batch!;
    return !batchEligibility(
      {
        inspectionStatus: batch.inspectionStatus,
        expiryBasis: batch.expiryBasis,
        expiresOn: batch.expiresOn ? batch.expiresOn.toISOString().slice(0, 10) : null,
        verificationResult: batch.verificationResult,
      },
      localDateIn(row.warehouse.timezone, now),
    ).eligible;
  });
}

/**
 * Units of each variant that may be sold from a warehouse now — one query for
 * a whole cart. Same rule as `sellableQuantity` in batches.service.
 */
export async function sellableQuantities(
  client: DbClient,
  variantIds: string[],
  warehouseId: string,
): Promise<Map<string, number>> {
  const result = new Map(variantIds.map((id) => [id, 0]));
  if (variantIds.length === 0) return result;
  const warehouse = await client.warehouse.findUnique({
    where: { id: warehouseId },
    select: { timezone: true, isActive: true },
  });
  if (!warehouse || !warehouse.isActive) return result;
  const today = localDateIn(warehouse.timezone, new Date());
  const balances = await client.stockBalance.findMany({
    where: { warehouseId, status: "SELLABLE", variantId: { in: variantIds }, variant: { trackInventory: true } },
    select: {
      variantId: true,
      onHand: true,
      reserved: true,
      variant: { select: { trackBatches: true } },
      batch: {
        select: { inspectionStatus: true, expiryBasis: true, expiresOn: true, verificationResult: true },
      },
    },
  });
  for (const row of balances) {
    const eligible = row.batch
      ? batchEligibility(
          {
            ...row.batch,
            expiresOn: row.batch.expiresOn ? row.batch.expiresOn.toISOString().slice(0, 10) : null,
          },
          today,
        ).eligible
      : !row.variant.trackBatches;
    if (eligible) result.set(row.variantId, (result.get(row.variantId) ?? 0) + row.onHand - row.reserved);
  }
  return result;
}
