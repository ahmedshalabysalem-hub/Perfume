import "server-only";
import type { StockMovementType, StockStatus } from "@/generated/prisma/enums";
import { parseMoneyInput } from "@/lib/money";
import { MAX_LINE_QUANTITY, UNIT_COST_SCALE } from "@/lib/schemas/inventory";
import type { ServiceContext } from "@/server/context";
import type { Tx } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError } from "@/server/errors";

/**
 * The stock ledger (ADR-019). Every module that changes stock — opening
 * balances, receipts, sales, POS, returns, transfers, counts — calls
 * `postStockMovements` inside its own transaction. Nothing else writes
 * `stock_balances` or `stock_movements`.
 *
 * Authorisation is the caller's job: the ledger is a mechanism, not an entry
 * point, and assumes the caller has already checked the actor's permission
 * for the warehouses involved.
 */

export type StockMovementLine = {
  variantId: string;
  warehouseId: string;
  status: StockStatus;
  /** Signed whole units: positive adds stock, negative removes it. */
  quantity: number;
  /** Cost per unit (decimal string, ≤ 4 decimals) in the warehouse country's currency. */
  unitCost?: string | null;
};

export type StockPosting = {
  type: StockMovementType;
  /**
   * Identifies the business event, e.g. "order:<id>:ship". Posting the same
   * key again with the same lines is a no-op that returns the original
   * movements; a different payload under the same key is rejected.
   */
  idempotencyKey: string;
  document?: { type: string; id: string } | null;
  reason?: string | null;
  lines: StockMovementLine[];
};

export type PostedMovement = {
  id: string;
  lineNo: number;
  variantId: string;
  warehouseId: string;
  status: StockStatus;
  quantity: number;
  balanceAfter: number;
};

export type PostingResult = { replayed: boolean; movements: PostedMovement[] };

const MAX_LINES = 500;

/**
 * Serialise work on one posting key for the rest of the transaction. Safe to
 * call more than once in the same transaction (advisory locks are re-entrant).
 */
export async function lockPostingKey(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`stock:${key}`}, 0))) AS l`;
}

type NormalizedLine = StockMovementLine & { lineNo: number; unitCost: string | null };

function normalizePosting(posting: StockPosting): NormalizedLine[] {
  const key = posting.idempotencyKey;
  if (typeof key !== "string" || key.trim() === "" || key.length > 120) {
    throw new Error("postStockMovements: idempotencyKey must be 1–120 characters");
  }
  if (posting.lines.length === 0 || posting.lines.length > MAX_LINES) {
    throw new Error(`postStockMovements: a posting needs 1–${MAX_LINES} lines`);
  }
  return posting.lines.map((line, index) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity === 0 || Math.abs(line.quantity) > MAX_LINE_QUANTITY) {
      throw new Error(`postStockMovements: line ${index + 1} quantity must be a non-zero integer`);
    }
    let unitCost: string | null = null;
    if (line.unitCost !== undefined && line.unitCost !== null) {
      const parsed = parseMoneyInput(line.unitCost, UNIT_COST_SCALE);
      if (!parsed.ok) throw new Error(`postStockMovements: line ${index + 1} unit cost is invalid (${parsed.reason})`);
      unitCost = parsed.value;
    }
    return { ...line, unitCost, lineNo: index + 1 };
  });
}

function balanceKey(line: { warehouseId: string; variantId: string; status: string }): string {
  return `${line.warehouseId}|${line.variantId}|${line.status}`;
}

/** Same movement lines as an earlier posting under the same key? */
function samePosting(
  type: StockMovementType,
  lines: NormalizedLine[],
  existing: Array<{
    type: StockMovementType;
    lineNo: number;
    variantId: string;
    warehouseId: string;
    status: StockStatus;
    quantity: number;
    unitCost: { toFixed(digits: number): string } | null;
  }>,
): boolean {
  if (existing.length !== lines.length) return false;
  return lines.every((line, index) => {
    const row = existing[index]!;
    return (
      row.type === type &&
      row.lineNo === line.lineNo &&
      row.variantId === line.variantId &&
      row.warehouseId === line.warehouseId &&
      row.status === line.status &&
      row.quantity === line.quantity &&
      (row.unitCost === null ? null : row.unitCost.toFixed(UNIT_COST_SCALE)) === line.unitCost
    );
  });
}

export async function postStockMovements(tx: Tx, ctx: ServiceContext, posting: StockPosting): Promise<PostingResult> {
  const lines = normalizePosting(posting);
  const key = posting.idempotencyKey;

  // Duplicates of this posting wait here until the first one commits or rolls back.
  await lockPostingKey(tx, key);
  const previous = await tx.stockMovement.findMany({ where: { idempotencyKey: key }, orderBy: { lineNo: "asc" } });
  if (previous.length > 0) {
    if (!samePosting(posting.type, lines, previous)) throw new ConflictError("errors.conflict.stockPosting");
    return {
      replayed: true,
      movements: previous.map((row) => ({
        id: row.id,
        lineNo: row.lineNo,
        variantId: row.variantId,
        warehouseId: row.warehouseId,
        status: row.status,
        quantity: row.quantity,
        balanceAfter: row.balanceAfter,
      })),
    };
  }

  const warehouseIds = [...new Set(lines.map((line) => line.warehouseId))];
  const variantIds = [...new Set(lines.map((line) => line.variantId))];
  const [warehouses, variants] = await Promise.all([
    tx.warehouse.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, country: { select: { currencyCode: true } } },
    }),
    tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sku: true, trackInventory: true },
    }),
  ]);
  const currencyByWarehouse = new Map(warehouses.map((row) => [row.id, row.country.currencyCode]));
  const variantById = new Map(variants.map((row) => [row.id, row]));
  for (const line of lines) {
    if (!currencyByWarehouse.has(line.warehouseId)) throw new NotFoundError("warehouse");
    const variant = variantById.get(line.variantId);
    if (!variant) throw new NotFoundError("product_variant");
    if (!variant.trackInventory) {
      throw new InvalidStateError("errors.invalidState.inventoryNotTracked", { sku: variant.sku });
    }
  }

  // Lock balance rows in one global order so concurrent postings cannot deadlock.
  const ordered = [...lines].sort((a, b) => balanceKey(a).localeCompare(balanceKey(b)) || a.lineNo - b.lineNo);
  const balanceAfter = new Map<number, number>();
  for (const line of ordered) {
    if (line.quantity > 0) {
      await tx.stockBalance.createMany({
        data: [{ variantId: line.variantId, warehouseId: line.warehouseId, status: line.status }],
        skipDuplicates: true,
      });
      const rows = await tx.$queryRaw<Array<{ on_hand: number }>>`
        UPDATE "stock_balances"
           SET "on_hand" = "on_hand" + ${line.quantity}, "updated_at" = now()
         WHERE "variant_id" = ${line.variantId}::uuid
           AND "warehouse_id" = ${line.warehouseId}::uuid
           AND "status" = ${line.status}::"StockStatus"
        RETURNING "on_hand"`;
      balanceAfter.set(line.lineNo, rows[0]!.on_hand);
    } else {
      // Only unreserved stock can leave. Under READ COMMITTED, PostgreSQL waits
      // for a concurrent writer of this row and re-checks the condition on the
      // committed value, so two postings can never take the same unit.
      const rows = await tx.$queryRaw<Array<{ on_hand: number }>>`
        UPDATE "stock_balances"
           SET "on_hand" = "on_hand" + ${line.quantity}, "updated_at" = now()
         WHERE "variant_id" = ${line.variantId}::uuid
           AND "warehouse_id" = ${line.warehouseId}::uuid
           AND "status" = ${line.status}::"StockStatus"
           AND "on_hand" - "reserved" >= ${-line.quantity}
        RETURNING "on_hand"`;
      if (rows.length === 0) {
        throw new InvalidStateError("errors.invalidState.insufficientStock", {
          sku: variantById.get(line.variantId)!.sku,
        });
      }
      balanceAfter.set(line.lineNo, rows[0]!.on_hand);
    }
  }

  const actor = ctx.actor;
  const created = await tx.stockMovement.createManyAndReturn({
    data: lines.map((line) => ({
      type: posting.type,
      variantId: line.variantId,
      warehouseId: line.warehouseId,
      status: line.status,
      quantity: line.quantity,
      balanceAfter: balanceAfter.get(line.lineNo)!,
      unitCost: line.unitCost,
      currencyCode: line.unitCost === null ? null : currencyByWarehouse.get(line.warehouseId)!,
      documentType: posting.document?.type ?? null,
      documentId: posting.document?.id ?? null,
      reason: posting.reason?.slice(0, 500) ?? null,
      actorType: actor.kind === "system" ? "SYSTEM" : "USER",
      actorUserId: actor.kind === "user" ? actor.userId : null,
      correlationId: ctx.meta.correlationId.slice(0, 64),
      idempotencyKey: key,
      lineNo: line.lineNo,
    })),
    select: {
      id: true,
      lineNo: true,
      variantId: true,
      warehouseId: true,
      status: true,
      quantity: true,
      balanceAfter: true,
    },
  });
  return { replayed: false, movements: created.sort((a, b) => a.lineNo - b.lineNo) };
}
