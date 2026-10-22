import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { addDays, localDateIn } from "@/lib/inventory/batches";
import { systemContext, type ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { updateVariant } from "@/server/modules/catalog/variants.service";
import {
  changeBatchStatus,
  correctBatchDetails,
  getBatch,
  isBatchEligible,
  listBatches,
  listBatchesFefo,
  sellableQuantity,
  verifyBatch,
} from "@/server/modules/inventory/batches.service";
import { postStockMovements, type StockMovementLine, type StockPosting } from "@/server/modules/inventory/ledger";
import { getVariantStock, listStock, postOpeningBalance } from "@/server/modules/inventory/stock.service";
import { auditEntries, contextFor, createStaff, seedFixture, type Fixture } from "./fixtures";

// INV-002 (ADR-023, DR-001…DR-010). Acceptance criteria are named in the test titles.

let f: Fixture;
let productId: string;
/** Tracks batches and expiry. */
let variantId: string;
/** Tracks batches, not expiry. */
let noExpiryVariantId: string;
/** Tracks neither. */
let plainVariantId: string;
let egEntityId: string;
let egWarehouseId: string;
let invSa: ServiceContext;
let invEg: ServiceContext;
const system = systemContext("batches-test");
const today = () => localDateIn("Asia/Riyadh", new Date());

beforeEach(async () => {
  f = await seedFixture();
  const brand = await db.brand.create({ data: { slug: "house", nameEn: "House", nameAr: "دار" } });
  productId = (
    await db.product.create({
      data: { slug: "royal-oud", brandId: brand.id, nameEn: "Royal Oud", nameAr: "عود ملكي", searchText: "royal oud" },
    })
  ).id;
  variantId = (
    await db.productVariant.create({
      data: {
        productId,
        sku: "ROI-100",
        barcode: "PF0000001",
        barcodeType: "CODE_128",
        barcodeSource: "INTERNAL",
        trackExpiry: true,
      },
    })
  ).id;
  noExpiryVariantId = (await db.productVariant.create({ data: { productId, sku: "ROI-50" } })).id;
  plainVariantId = (await db.productVariant.create({ data: { productId, sku: "ROI-PLAIN", trackBatches: false } })).id;
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
  invSa = contextFor(
    await createStaff("inv.sa@test.local", "inventory_manager", { type: "COUNTRY", countryCode: "SA" }),
  );
  invEg = contextFor(
    await createStaff("inv.eg@test.local", "inventory_manager", { type: "COUNTRY", countryCode: "EG" }),
  );
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

/** Raw database error message, for statements that must be refused. */
async function dbErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the statement to fail");
}

function post(posting: StockPosting, ctx: ServiceContext = system) {
  return db.$transaction((tx) => postStockMovements(tx, ctx, posting));
}

const line = (batchId: string | null, quantity: number, extra: Partial<StockMovementLine> = {}): StockMovementLine => ({
  variantId,
  warehouseId: f.warehouseId,
  status: "SELLABLE",
  batchId,
  quantity,
  ...extra,
});

let keySeq = 0;
const adjust = (...lines: StockMovementLine[]): StockPosting => ({
  type: "ADJUSTMENT",
  idempotencyKey: `test-${++keySeq}`,
  lines,
});

type BatchOverrides = Partial<Parameters<typeof db.stockBatch.create>[0]["data"]>;

/** A batch of the SA company, created directly (the service paths are tested separately). */
async function newBatch(overrides: BatchOverrides & { variantId?: string } = {}) {
  return db.stockBatch.create({
    data: {
      legalEntityId: f.legalEntitySaId,
      countryCode: "SA",
      variantId,
      lotNumber: `LOT-${++keySeq}`,
      expiryBasis: "RECORDED",
      expiresOn: new Date(`${addDays(today(), 365)}T00:00:00Z`),
      expiryPrecision: "DAY",
      inspectionStatus: "RELEASED",
      ...overrides,
    } as Parameters<typeof db.stockBatch.create>[0]["data"],
  });
}

async function onHand(batchId: string | null, status = "SELLABLE", warehouseId = f.warehouseId, variant = variantId) {
  const row = await db.stockBalance.findFirst({
    where: { variantId: variant, warehouseId, status: status as "SELLABLE", batchId },
  });
  return row?.onHand ?? 0;
}

async function version(batchId: string) {
  return (await db.stockBatch.findUniqueOrThrow({ where: { id: batchId } })).version;
}

/** Σ movements = balance, per key (ADR-020), batch included. */
async function expectLedgerConsistent() {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT b."id" FROM "stock_balances" b
     WHERE b."on_hand" <> COALESCE((
       SELECT SUM(m."quantity") FROM "stock_movements" m
        WHERE m."variant_id" = b."variant_id" AND m."warehouse_id" = b."warehouse_id"
          AND m."status" = b."status" AND m."batch_id" IS NOT DISTINCT FROM b."batch_id"), 0)`;
  expect(rows).toEqual([]);
}

/**
 * Stock recorded before INV-002: unbatched balances of a batch-tracked
 * variant, then the migration's own carry-over. The guards that now forbid
 * such balances are switched off inside this one transaction only, exactly as
 * the migration ran before it created them.
 */
async function legacyStock(variant: string, lines: Array<{ status: "SELLABLE" | "QUARANTINED"; quantity: number }>) {
  await db.productVariant.update({ where: { id: variant }, data: { trackBatches: false, trackExpiry: false } });
  for (const entry of lines) {
    await post(
      adjust({ variantId: variant, warehouseId: f.warehouseId, status: entry.status, quantity: entry.quantity }),
    );
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE "product_variants" DISABLE TRIGGER "product_variants_tracking_guard"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "stock_balances" DISABLE TRIGGER "stock_balances_batch_rules"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "stock_balances" DISABLE TRIGGER "stock_balances_sellable_guard"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "stock_movements" DISABLE TRIGGER "stock_movements_batch_rules"`);
    await tx.$executeRaw`UPDATE "product_variants" SET "track_batches" = true WHERE "id" = ${variant}::uuid`;
    await tx.$queryRaw`SELECT "stock_carry_over_to_legacy_batches"()`;
    await tx.$executeRawUnsafe(`ALTER TABLE "product_variants" ENABLE TRIGGER "product_variants_tracking_guard"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "stock_balances" ENABLE TRIGGER "stock_balances_batch_rules"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "stock_balances" ENABLE TRIGGER "stock_balances_sellable_guard"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "stock_movements" ENABLE TRIGGER "stock_movements_batch_rules"`);
  });
  return db.stockBatch.findFirstOrThrow({ where: { variantId: variant, isLegacy: true } });
}

const verification = (batchId: string, batchVersion: number, overrides: Record<string, unknown> = {}) => ({
  batchId,
  version: batchVersion,
  physicalCheckOk: "PASS",
  labelCheckOk: "PASS",
  expiryOutcome: "UNKNOWN",
  notes: "Sealed, label intact, no date printed",
  reason: "Legacy stock check",
  ...overrides,
});

const decision = (batchId: string, batchVersion: number, status: string, reason = "Inspection done") => ({
  batchId,
  version: batchVersion,
  status,
  reason,
});

describe("ledger batch rules (AC 1, 11)", () => {
  it("requires a batch for batch-tracked variants and refuses one for others", async () => {
    expect((await errorOf(post(adjust(line(null, 5))))).messageKey).toBe("errors.invalidState.batchRequired");
    const batch = await newBatch();
    const refused = await errorOf(post(adjust(line(batch.id, 5, { variantId: plainVariantId }))));
    expect(refused.messageKey).toBe("errors.invalidState.batchNotAllowed");
    await post(adjust(line(null, 2, { variantId: plainVariantId })));
    await post(adjust(line(batch.id, 5)));
    expect(await onHand(batch.id)).toBe(5);
  });

  it("refuses a batch of another variant or of another company", async () => {
    const other = await newBatch({
      variantId: noExpiryVariantId,
      expiryBasis: "NOT_TRACKED",
      expiresOn: null,
      expiryPrecision: null,
    });
    expect((await errorOf(post(adjust(line(other.id, 1))))).code).toBe("NOT_FOUND");
    const sa = await newBatch();
    const foreign = await errorOf(post(adjust(line(sa.id, 1, { warehouseId: egWarehouseId }))));
    expect(foreign.messageKey).toBe("errors.invalidState.batchOtherCompany");
  });

  it("is enforced by the database for direct writes", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 3)));
    const balance = (status: string, batchId: string | null, warehouseId = f.warehouseId, variant = variantId) =>
      db.$executeRaw`INSERT INTO "stock_balances" ("id", "variant_id", "warehouse_id", "status", "batch_id", "on_hand", "reserved", "updated_at")
        VALUES (gen_random_uuid(), ${variant}::uuid, ${warehouseId}::uuid, ${status}::"StockStatus", ${batchId}::uuid, 0, 0, now())`;
    expect(await dbErrorOf(balance("DAMAGED", null))).toContain("needs a batch");
    expect(await dbErrorOf(balance("DAMAGED", batch.id, f.warehouseId, plainVariantId))).toMatch(
      /cannot carry one|foreign key/,
    );
    expect(await dbErrorOf(balance("DAMAGED", batch.id, egWarehouseId))).toContain("another company");
    // Composite key: a batch is only ever used with its own variant.
    expect(await dbErrorOf(balance("DAMAGED", batch.id, f.warehouseId, noExpiryVariantId))).toContain(
      "stock_balances_batch_id_variant_id_fkey",
    );
    // A batch cannot name another company's supplier.
    const egSupplier = await db.supplier.create({
      data: {
        code: "SUP-EG",
        legalEntityId: egEntityId,
        countryCode: "EG",
        nameEn: "EG Supplier",
        nameAr: "مورد مصر",
        supplierCountryCode: "EG",
        currencyCode: "EGP",
        paymentTerms: "PREPAID",
      },
    });
    expect(
      await dbErrorOf(
        db.$executeRaw`UPDATE "stock_batches" SET "supplier_id" = ${egSupplier.id}::uuid, "version" = "version" + 1 WHERE "id" = ${batch.id}::uuid`,
      ),
    ).toContain("stock_batches_supplier_id_legal_entity_id_fkey");
    expect(await dbErrorOf(db.$executeRaw`DELETE FROM "stock_batches" WHERE "id" = ${batch.id}::uuid`)).toContain(
      "cannot be deleted",
    );
  });
});

describe("sale eligibility (AC 2, 15, 19, 20)", () => {
  it("never accepts sellable stock for pending, quarantined, rejected or expired batches", async () => {
    const cases = [
      await newBatch({ inspectionStatus: "PENDING_INSPECTION" }),
      await newBatch({ inspectionStatus: "QUARANTINED", statusReason: "Held" }),
      await newBatch({ inspectionStatus: "REJECTED", statusReason: "Damaged" }),
      await newBatch({ expiresOn: new Date(`${addDays(today(), -1)}T00:00:00Z`) }),
    ];
    for (const batch of cases) {
      const error = await errorOf(post(adjust(line(batch.id, 4))));
      expect(error.messageKey).toBe("errors.invalidState.batchNotEligible");
      // Non-sellable statuses still take the stock.
      await post(adjust(line(batch.id, 4, { status: "QUARANTINED" })));
      expect((await isBatchEligible(db, batch.id, f.warehouseId)).eligible).toBe(false);
    }
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(0);
  });

  it("counts released stock with a future expiry, up to and including the expiry day", async () => {
    const future = await newBatch();
    const lastDay = await newBatch({ expiresOn: new Date(`${today()}T00:00:00Z`) });
    await post(adjust(line(future.id, 5), line(lastDay.id, 3)));
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(8);
    expect(await isBatchEligible(db, lastDay.id, f.warehouseId)).toEqual({ eligible: true });
    const [row] = await db.$queryRaw<Array<{ ok: boolean }>>`
      SELECT "stock_batch_is_sellable"(${lastDay.id}::uuid, ${f.warehouseId}::uuid) AS ok`;
    expect(row?.ok).toBe(true);
  });

  it("stops counting stock once its expiry is known to be past, and refuses to release it", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 5)));
    await correctBatchDetails(invSa, {
      batchId: batch.id,
      version: batch.version,
      expiresOn: addDays(today(), -1),
      reason: "Label re-read: expired yesterday",
    });
    expect(await isBatchEligible(db, batch.id, f.warehouseId)).toEqual({ eligible: false, reason: "EXPIRED" });
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(0);
    const stock = (await getVariantStock(invSa, variantId, {}))!;
    expect(stock.balances[0]).toMatchObject({ onHand: 5, availableForSale: 0, ineligibleReason: "EXPIRED" });
    // Removing expired stock stays possible (INV-003 disposal); adding sellable stock is refused.
    expect((await errorOf(post(adjust(line(batch.id, 1))))).messageKey).toBe("errors.invalidState.batchNotEligible");
    await changeBatchStatus(invSa, decision(batch.id, await version(batch.id), "QUARANTINED", "Expired"));
    expect(await onHand(batch.id, "QUARANTINED")).toBe(5);
    const refused = await errorOf(changeBatchStatus(invSa, decision(batch.id, await version(batch.id), "RELEASED")));
    expect(refused.messageKey).toBe("errors.invalidState.batchExpired");
  });

  it("is enforced by the database when sellable stock of an ineligible batch would grow", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 2)));
    await changeBatchStatus(invSa, decision(batch.id, batch.version, "QUARANTINED", "Smell check"));
    expect(await onHand(batch.id)).toBe(0);
    expect(
      await dbErrorOf(
        db.$executeRaw`UPDATE "stock_balances" SET "on_hand" = "on_hand" + 1
          WHERE "batch_id" = ${batch.id}::uuid AND "status" = 'SELLABLE'`,
      ),
    ).toContain("not eligible for sale");
  });

  it("is enforced by the database when a direct update relabels a balance's key", async () => {
    const pending = await newBatch({ inspectionStatus: "PENDING_INSPECTION" });
    await post(adjust(line(pending.id, 10, { status: "QUARANTINED" })));
    const egBatch = await db.stockBatch.create({
      data: {
        legalEntityId: egEntityId,
        countryCode: "EG",
        variantId,
        lotNumber: "EG-LOT",
        expiryBasis: "RECORDED",
        expiresOn: new Date(`${addDays(today(), 365)}T00:00:00Z`),
        expiryPrecision: "DAY",
        inspectionStatus: "RELEASED",
      },
    });
    const relabel = (set: Prisma.Sql) =>
      dbErrorOf(
        db.$executeRaw`UPDATE "stock_balances" SET ${set}
          WHERE "batch_id" = ${pending.id}::uuid AND "status" = 'QUARANTINED'`,
      );
    expect(await relabel(Prisma.sql`"status" = 'SELLABLE'`)).toContain("cannot change");
    expect(await relabel(Prisma.sql`"batch_id" = ${egBatch.id}::uuid`)).toContain("cannot change");
    expect(await relabel(Prisma.sql`"batch_id" = NULL`)).toContain("cannot change");
    expect(await relabel(Prisma.sql`"warehouse_id" = ${egWarehouseId}::uuid`)).toContain("cannot change");
    expect(await onHand(pending.id, "QUARANTINED")).toBe(10);
    expect(await onHand(pending.id, "SELLABLE")).toBe(0);
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(0);
    await expectLedgerConsistent();
  });
});

describe("opening balances with batches (AC 5 of the spec scope, DR-002)", () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    variantCode: "ROI-100",
    warehouseId: f.warehouseId,
    status: "SELLABLE",
    quantity: "10",
    unitCost: "85",
    reason: "Go-live count",
    lotNumber: "a-1",
    expiresOn: addDays(today(), 400).slice(0, 7),
    ...overrides,
  });

  it("creates a released batch for a sellable lot entered by someone who may release, with month precision", async () => {
    await postOpeningBalance(invSa, input());
    const batch = await db.stockBatch.findFirstOrThrow({ where: { lotNumber: "A-1" } });
    expect(batch).toMatchObject({ inspectionStatus: "RELEASED", expiryBasis: "RECORDED", expiryPrecision: "MONTH" });
    const expires = batch.expiresOn!.toISOString().slice(0, 10);
    expect(addDays(expires, 1).endsWith("-01")).toBe(true);
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(10);
    expect((await auditEntries("inventory.batch.create"))[0]).toMatchObject({
      entityId: batch.id,
      reason: "Go-live count",
    });
    // Same lot, other status: the batch is reused; once per batch key.
    await postOpeningBalance(invSa, input({ status: "DAMAGED", quantity: "1" }));
    expect(await db.stockBatch.count()).toBe(1);
    expect((await errorOf(postOpeningBalance(invSa, input({ quantity: "1" })))).messageKey).toBe(
      "errors.invalidState.openingBalanceExists",
    );
    const differ = await errorOf(
      postOpeningBalance(invSa, input({ status: "RETURNED", expiresOn: addDays(today(), 30) })),
    );
    expect(differ.fieldErrors).toEqual({ expiresOn: ["errors.inventory.batchDetailsDiffer"] });
  });

  it("does not let a manager without the batch permission release a new lot (DR-002)", async () => {
    const refused = await errorOf(postOpeningBalance(f.saManager, input()));
    expect(refused.messageKey).toBe("errors.invalidState.releaseNeedsPermission");
    expect(await db.stockBatch.count()).toBe(0);
    await postOpeningBalance(f.saManager, input({ status: "QUARANTINED" }));
    expect(await db.stockBatch.findFirstOrThrow()).toMatchObject({ inspectionStatus: "PENDING_INSPECTION" });
  });

  it("requires a lot and an expiry where the catalogue says so, and refuses batch fields otherwise", async () => {
    expect((await errorOf(postOpeningBalance(invSa, input({ lotNumber: "" })))).fieldErrors).toEqual({
      lotNumber: ["errors.inventory.lotRequired"],
    });
    expect((await errorOf(postOpeningBalance(invSa, input({ expiresOn: "" })))).fieldErrors).toEqual({
      expiresOn: ["errors.inventory.expiryRequired"],
    });
    expect((await errorOf(postOpeningBalance(invSa, input({ variantCode: "ROI-PLAIN" })))).fieldErrors).toEqual({
      lotNumber: ["errors.inventory.batchNotTracked"],
    });
    // No expiry is inferred when the variant does not track it.
    await postOpeningBalance(invSa, input({ variantCode: "ROI-50", expiresOn: "" }));
    expect(await db.stockBatch.findFirstOrThrow()).toMatchObject({ expiryBasis: "NOT_TRACKED", expiresOn: null });
  });

  it("refuses an already expired lot as sellable, leaving nothing behind", async () => {
    const error = await errorOf(postOpeningBalance(invSa, input({ expiresOn: addDays(today(), -1) })));
    expect(error.messageKey).toBe("errors.invalidState.batchNotEligible");
    expect(await db.stockBatch.count()).toBe(0);
    expect(await db.stockMovement.count()).toBe(0);
  });
});

describe("inspection decisions (AC 3, 6, 10)", () => {
  async function pendingWithStock() {
    await postOpeningBalance(f.saManager, {
      variantCode: "ROI-100",
      warehouseId: f.warehouseId,
      status: "QUARANTINED",
      quantity: "7",
      unitCost: "50",
      reason: "Received before go-live",
      lotNumber: "P-1",
      expiresOn: addDays(today(), 200),
    });
    return db.stockBatch.findFirstOrThrow({ where: { lotNumber: "P-1" } });
  }

  it("releases through INSPECTION movements in one transaction, keeping the ledger consistent", async () => {
    const batch = await pendingWithStock();
    const result = await changeBatchStatus(invSa, decision(batch.id, batch.version, "RELEASED", "Seals and labels OK"));
    expect(result).toEqual({ version: batch.version + 1, replayed: false });
    expect(await onHand(batch.id, "QUARANTINED")).toBe(0);
    expect(await onHand(batch.id)).toBe(7);
    const movements = await db.stockMovement.findMany({ where: { type: "INSPECTION" }, orderBy: { lineNo: "asc" } });
    expect(movements.map((m) => [m.status, m.quantity, m.idempotencyKey])).toEqual([
      ["QUARANTINED", -7, `batch:${batch.id}:status:v${batch.version}`],
      ["SELLABLE", 7, `batch:${batch.id}:status:v${batch.version}`],
    ]);
    const [audit] = await auditEntries("inventory.batch.status");
    expect(audit).toMatchObject({ entityId: batch.id, reason: "Seals and labels OK" });
    expect(audit?.before).toMatchObject({ inspectionStatus: "PENDING_INSPECTION" });
    expect(audit?.after).toMatchObject({ inspectionStatus: "RELEASED", unitsMoved: 7 });

    // Quarantine takes unreserved sellable stock out of sale; release brings it back.
    await changeBatchStatus(invSa, decision(batch.id, await version(batch.id), "QUARANTINED", "Customer complaint"));
    expect([await onHand(batch.id), await onHand(batch.id, "QUARANTINED")]).toEqual([0, 7]);
    await changeBatchStatus(invSa, decision(batch.id, await version(batch.id), "RELEASED", "Complaint unfounded"));
    expect(await onHand(batch.id)).toBe(7);
    await expectLedgerConsistent();
  });

  it("allows only inventory.batches.manage holders in scope, never the Business Manager (DR-002)", async () => {
    const batch = await pendingWithStock();
    expect((await errorOf(changeBatchStatus(f.saManager, decision(batch.id, 1, "RELEASED")))).code).toBe("FORBIDDEN");
    expect((await errorOf(changeBatchStatus(invEg, decision(batch.id, 1, "RELEASED")))).code).toBe("FORBIDDEN");
    expect((await errorOf(verifyBatch(f.saManager, verification(batch.id, 1)))).code).toBe("FORBIDDEN");
    expect((await errorOf(correctBatchDetails(f.cashier, { batchId: batch.id, version: 1, reason: "x" }))).code).toBe(
      "FORBIDDEN",
    );
    expect((await errorOf(changeBatchStatus(invSa, decision(batch.id, 1, "REJECTED", "")))).code).toBe("VALIDATION");
    await changeBatchStatus(f.superAdmin, decision(batch.id, 1, "REJECTED", "Broken seals"));
    // Rejection is final and takes nothing out of the ledger.
    expect(await onHand(batch.id, "QUARANTINED")).toBe(7);
    const final = await errorOf(changeBatchStatus(invSa, decision(batch.id, 2, "RELEASED")));
    expect(final.messageKey).toBe("errors.invalidState.transition");
    expect((await errorOf(verifyBatch(invSa, verification(batch.id, 2)))).messageKey).toBe(
      "errors.invalidState.batchRejected",
    );
  });

  it("treats a double submit as a replay and a stale screen as a conflict", async () => {
    const batch = await pendingWithStock();
    await changeBatchStatus(invSa, decision(batch.id, 1, "RELEASED"));
    expect(await changeBatchStatus(invSa, decision(batch.id, 1, "RELEASED"))).toEqual({ version: 2, replayed: true });
    expect(await db.stockMovement.count({ where: { type: "INSPECTION" } })).toBe(2);
    // Another user, or another decision, on the old version is a conflict.
    const stale = await errorOf(changeBatchStatus(f.superAdmin, decision(batch.id, 1, "RELEASED")));
    expect(stale.messageKey).toBe("errors.conflict.batchVersion");
    expect((await errorOf(changeBatchStatus(invSa, decision(batch.id, 1, "QUARANTINED", "x")))).code).toBe("CONFLICT");
    // The same decision with another reason (a second tab) is a conflict, not a replay.
    expect((await errorOf(changeBatchStatus(invSa, decision(batch.id, 1, "RELEASED", "Other tab")))).code).toBe(
      "CONFLICT",
    );
  });

  it("serialises competing decisions on the same version", async () => {
    const batch = await pendingWithStock();
    const results = await Promise.allSettled([
      changeBatchStatus(invSa, decision(batch.id, 1, "RELEASED")),
      changeBatchStatus(f.superAdmin, decision(batch.id, 1, "REJECTED", "Leaking")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await db.stockBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(after.version).toBe(2);
    expect(await onHand(batch.id)).toBe(after.inspectionStatus === "RELEASED" ? 7 : 0);
    await expectLedgerConsistent();
  });
});

describe("concurrency per batch (AC 4, G3)", () => {
  it("never oversells a batch under concurrent removals", async () => {
    const batch = await newBatch();
    const other = await newBatch();
    await post(adjust(line(batch.id, 5), line(other.id, 5)));
    const attempts = await Promise.allSettled(Array.from({ length: 9 }, () => post(adjust(line(batch.id, -1)))));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(5);
    expect(await onHand(batch.id)).toBe(0);
    expect(await onHand(other.id)).toBe(5);
    await expectLedgerConsistent();
  });

  it("does not deadlock when postings touch two batches in opposite orders", async () => {
    const a = await newBatch();
    const b = await newBatch();
    await post(adjust(line(a.id, 20), line(b.id, 20)));
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post(i % 2 === 0 ? adjust(line(a.id, -1), line(b.id, -1)) : adjust(line(b.id, -1), line(a.id, -1))),
      ),
    );
    expect([await onHand(a.id), await onHand(b.id)]).toEqual([10, 10]);
    await expectLedgerConsistent();
  });

  it("keeps a quarantine and concurrent sales consistent", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 10)));
    await Promise.allSettled([
      changeBatchStatus(invSa, decision(batch.id, batch.version, "QUARANTINED", "Recall check")),
      ...Array.from({ length: 4 }, () => post(adjust(line(batch.id, -1)))),
    ]);
    const sellable = await onHand(batch.id);
    const quarantined = await onHand(batch.id, "QUARANTINED");
    expect(sellable).toBe(0);
    expect(
      sellable + quarantined + (await db.stockMovement.count({ where: { type: "ADJUSTMENT", quantity: -1 } })),
    ).toBe(10);
    await expectLedgerConsistent();
  });
});

describe("LEGACY stock (DR-008, DR-010; AC 16–18, 21–23)", () => {
  it("carries stock over in the same status, unverified and not sellable, inventing nothing (AC 23)", async () => {
    const legacy = await legacyStock(variantId, [
      { status: "SELLABLE", quantity: 6 },
      { status: "QUARANTINED", quantity: 2 },
    ]);
    expect(legacy).toMatchObject({
      isLegacy: true,
      lotNumber: null,
      manufacturedOn: null,
      expiresOn: null,
      expiryBasis: "UNKNOWN",
      inspectionStatus: "PENDING_INSPECTION",
      verificationResult: "NONE",
      detailsComplete: false,
    });
    expect([await onHand(legacy.id), await onHand(legacy.id, "QUARANTINED"), await onHand(null)]).toEqual([6, 2, 0]);
    expect(await db.stockMovement.count({ where: { type: "BATCH_ASSIGNMENT" } })).toBe(4);
    expect(await db.stockMovement.count({ where: { type: "ADJUSTMENT" } })).toBe(2);
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(0);
    // The stock list shows the units on hand but none of them as available for sale; the emptied
    // pre-batch balance stays (at zero) with its history.
    const list = await listStock(invSa, { status: "SELLABLE" });
    expect(list.rows.map((r) => [r.batch?.isLegacy, r.onHand, r.available, r.availableForSale])).toEqual([
      [true, 6, 6, 0],
      [undefined, 0, 0, 0],
    ]);
    expect((await auditEntries("inventory.batch.legacy_create"))[0]?.entityId).toBe(legacy.id);
    // Running the carry-over again changes nothing.
    const [again] = await db.$queryRaw<Array<{ n: number }>>`SELECT "stock_carry_over_to_legacy_batches"() AS n`;
    expect(again?.n).toBe(0);
    await expectLedgerConsistent();
  });

  it("is sellable only after a passing verification and a separate release (AC 16, 17, 18)", async () => {
    const legacy = await legacyStock(variantId, [
      { status: "SELLABLE", quantity: 6 },
      { status: "QUARANTINED", quantity: 2 },
    ]);
    // Release without verification: refused by the service and by the CHECK.
    const early = await errorOf(changeBatchStatus(invSa, decision(legacy.id, 1, "RELEASED")));
    expect(early.messageKey).toBe("errors.invalidState.batchNeedsVerification");
    expect(
      await dbErrorOf(
        db.$executeRaw`UPDATE "stock_batches" SET "inspection_status" = 'RELEASED', "version" = 2 WHERE "id" = ${legacy.id}::uuid`,
      ),
    ).toContain("stock_batches_release_needs_verification");

    // Verification alone changes nothing about sale.
    const verified = await verifyBatch(invSa, verification(legacy.id, 1));
    expect(verified).toEqual({ version: 2, replayed: false });
    // The same submit again is a replay; a second tab with other answers is a conflict.
    expect(await verifyBatch(invSa, verification(legacy.id, 1))).toEqual({ version: 2, replayed: true });
    for (const other of [
      { notes: "Seal torn" },
      { expiryOutcome: "DATE", expiresOn: addDays(today(), 90) },
      { lotNumber: "L-OTHER" },
    ]) {
      expect((await errorOf(verifyBatch(invSa, verification(legacy.id, 1, other)))).code).toBe("CONFLICT");
    }
    const afterVerify = await db.stockBatch.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(afterVerify).toMatchObject({
      verificationResult: "PASSED",
      physicalCheckOk: true,
      labelCheckOk: true,
      inspectionStatus: "PENDING_INSPECTION",
      expiryBasis: "UNKNOWN",
      verifiedById: invSa.actor.kind === "user" ? invSa.actor.userId : "",
    });
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(0);
    expect(await db.stockMovement.count({ where: { type: "INSPECTION" } })).toBe(0);
    expect((await auditEntries("inventory.batch.verify"))[0]).toMatchObject({ reason: "Legacy stock check" });

    await changeBatchStatus(invSa, decision(legacy.id, 2, "RELEASED", "Verified, expiry unknown"));
    expect(await isBatchEligible(db, legacy.id, f.warehouseId)).toEqual({ eligible: true });
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(6);
    // Stock quarantined before INV-002 stays where it was (AC 23).
    expect(await onHand(legacy.id, "QUARANTINED")).toBe(2);
    expect(await db.stockMovement.count({ where: { type: "INSPECTION" } })).toBe(0);
    await expectLedgerConsistent();
  });

  it("takes stock out of sale in the same action when a check fails (AC 21)", async () => {
    const legacy = await legacyStock(variantId, [{ status: "SELLABLE", quantity: 6 }]);
    const missing = await errorOf(verifyBatch(invSa, verification(legacy.id, 1, { labelCheckOk: "FAIL" })));
    expect(missing.fieldErrors).toHaveProperty("onFailure");
    await verifyBatch(
      invSa,
      verification(legacy.id, 1, { labelCheckOk: "FAIL", onFailure: "QUARANTINED", reason: "Label torn" }),
    );
    const after = await db.stockBatch.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after).toMatchObject({
      verificationResult: "FAILED",
      inspectionStatus: "QUARANTINED",
      statusReason: "Label torn",
    });
    expect([await onHand(legacy.id), await onHand(legacy.id, "QUARANTINED")]).toEqual([0, 6]);
    expect(await sellableQuantity(db, variantId, f.warehouseId)).toBe(0);
    // A failed batch cannot be released until a new verification passes.
    expect((await errorOf(changeBatchStatus(invSa, decision(legacy.id, 2, "RELEASED")))).messageKey).toBe(
      "errors.invalidState.batchNeedsVerification",
    );
    await verifyBatch(
      invSa,
      verification(legacy.id, 2, { labelCheckOk: "FAIL", onFailure: "REJECTED", reason: "Counterfeit" }),
    );
    expect(await db.stockBatch.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({
      inspectionStatus: "REJECTED",
    });
    await expectLedgerConsistent();
  });

  it("quarantines a released batch whose new check fails; it is never rejected directly", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 4)));
    const direct = await errorOf(
      verifyBatch(
        invSa,
        verification(batch.id, 1, {
          expiryOutcome: "DATE",
          expiresOn: addDays(today(), 365),
          physicalCheckOk: "FAIL",
          onFailure: "REJECTED",
        }),
      ),
    );
    expect(direct.messageKey).toBe("errors.invalidState.transition");
    await verifyBatch(
      invSa,
      verification(batch.id, 1, {
        expiryOutcome: "DATE",
        expiresOn: addDays(today(), 365),
        physicalCheckOk: "FAIL",
        onFailure: "QUARANTINED",
      }),
    );
    expect([await onHand(batch.id), await onHand(batch.id, "QUARANTINED")]).toEqual([0, 4]);
  });

  it("never gets NOT_TRACKED from an empty field; 'not applicable' only where the catalogue says so (AC 22)", async () => {
    const tracked = await legacyStock(variantId, [{ status: "SELLABLE", quantity: 1 }]);
    // legacyStock switched trackExpiry off for the carry-over; the catalogue now tracks expiry again.
    await db.productVariant.update({ where: { id: variantId }, data: { trackExpiry: true } });
    const refused = await errorOf(verifyBatch(invSa, verification(tracked.id, 1, { expiryOutcome: "NOT_APPLICABLE" })));
    expect(refused.messageKey).toBe("errors.invalidState.expiryTracked");
    // An empty date with outcome UNKNOWN stays UNKNOWN.
    await verifyBatch(invSa, verification(tracked.id, 1));
    expect((await db.stockBatch.findUniqueOrThrow({ where: { id: tracked.id } })).expiryBasis).toBe("UNKNOWN");

    const untracked = await legacyStock(noExpiryVariantId, [{ status: "SELLABLE", quantity: 1 }]);
    await verifyBatch(invSa, verification(untracked.id, 1, { expiryOutcome: "NOT_APPLICABLE" }));
    expect((await db.stockBatch.findUniqueOrThrow({ where: { id: untracked.id } })).expiryBasis).toBe("NOT_TRACKED");
    // Expiry tracking cannot be switched on while that batch says it does not apply.
    const locked = await errorOf(
      updateVariant(f.superAdmin, noExpiryVariantId, {
        sku: "ROI-50",
        trackInventory: true,
        trackBatches: true,
        trackExpiry: true,
        isTester: false,
      }),
    );
    expect(locked.messageKey).toBe("errors.invalidState.expiryTrackingBlocked");
  });

  it("records a label date exactly and refuses release once it is past (AC 19)", async () => {
    const legacy = await legacyStock(variantId, [{ status: "SELLABLE", quantity: 3 }]);
    await verifyBatch(invSa, verification(legacy.id, 1, { expiryOutcome: "DATE", expiresOn: addDays(today(), -1) }));
    const after = await db.stockBatch.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after).toMatchObject({ expiryBasis: "RECORDED", expiryPrecision: "DAY" });
    const refused = await errorOf(changeBatchStatus(invSa, decision(legacy.id, 2, "RELEASED")));
    expect(refused.messageKey).toBe("errors.invalidState.batchExpired");
    // A recorded date cannot be turned back into "unknown".
    expect((await errorOf(verifyBatch(invSa, verification(legacy.id, 2)))).messageKey).toBe(
      "errors.invalidState.expiryAlreadyRecorded",
    );
  });
});

describe("batch details and lot numbers (AC 9, 12, 13, DR-005)", () => {
  it("keeps a lot number fixed once stock exists, except on LEGACY batches, which cannot take a used lot", async () => {
    const legacy = await legacyStock(variantId, [{ status: "SELLABLE", quantity: 2 }]);
    const batch = await newBatch({ lotNumber: "FIX-1" });
    await post(adjust(line(batch.id, 1)));
    const fixed = await errorOf(
      correctBatchDetails(invSa, { batchId: batch.id, version: 1, lotNumber: "FIX-2", reason: "Typo" }),
    );
    expect(fixed.messageKey).toBe("errors.invalidState.lotNumberFixed");
    expect(
      await dbErrorOf(
        db.$executeRaw`UPDATE "stock_batches" SET "lot_number" = 'FIX-2', "version" = 2 WHERE "id" = ${batch.id}::uuid`,
      ),
    ).toContain("fixed once stock is recorded");

    const taken = await errorOf(
      correctBatchDetails(invSa, { batchId: legacy.id, version: 1, lotNumber: "fix-1", reason: "Found label" }),
    );
    expect(taken.messageKey).toBe("errors.conflict.lotNumber");
    await correctBatchDetails(invSa, { batchId: legacy.id, version: 1, lotNumber: "L-77", reason: "Found label" });
    expect(await db.stockBatch.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({
      lotNumber: "L-77",
      detailsComplete: true,
      inspectionStatus: "PENDING_INSPECTION",
    });
    const [audit] = await auditEntries("inventory.batch.update");
    expect(audit?.before).toMatchObject({ lotNumber: null });
    expect(audit?.after).toMatchObject({ lotNumber: "L-77" });
  });

  it("validates dates and the supplier's company, and needs a reason", async () => {
    const batch = await newBatch();
    const egSupplier = await db.supplier.create({
      data: {
        code: "SUP-EG",
        legalEntityId: egEntityId,
        countryCode: "EG",
        nameEn: "EG",
        nameAr: "مصر",
        supplierCountryCode: "EG",
        currencyCode: "EGP",
        paymentTerms: "PREPAID",
      },
    });
    const foreign = await errorOf(
      correctBatchDetails(invSa, { batchId: batch.id, version: 1, supplierId: egSupplier.id, reason: "x" }),
    );
    expect(foreign.fieldErrors).toEqual({ supplierId: ["errors.inventory.supplierOtherCompany"] });
    const order = await errorOf(
      correctBatchDetails(invSa, {
        batchId: batch.id,
        version: 1,
        manufacturedOn: addDays(today(), 400),
        expiresOn: addDays(today(), 300),
        reason: "x",
      }),
    );
    expect(order.code).toBe("VALIDATION");
    expect((await errorOf(correctBatchDetails(invSa, { batchId: batch.id, version: 1, reason: "" }))).code).toBe(
      "VALIDATION",
    );
  });

  it("freezes tracking flags once the variant has ledger history (service and database)", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 1)));
    const error = await errorOf(
      updateVariant(f.superAdmin, variantId, {
        sku: "ROI-100",
        barcode: "PF0000001",
        barcodeType: "CODE_128",
        barcodeSource: "INTERNAL",
        trackInventory: true,
        trackBatches: false,
        trackExpiry: false,
        isTester: false,
      }),
    );
    expect(error.messageKey).toBe("errors.invalidState.trackingLocked");
    expect(
      await dbErrorOf(
        db.$executeRaw`UPDATE "product_variants" SET "track_batches" = false WHERE "id" = ${variantId}::uuid`,
      ),
    ).toContain("cannot change once stock is recorded");
  });
});

describe("batch queries (AC 7, 14, DR-006)", () => {
  it("lists in FEFO order with expiring, expired, unknown and incomplete filters", async () => {
    const soon = await newBatch({ lotNumber: "SOON", expiresOn: new Date(`${addDays(today(), 10)}T00:00:00Z`) });
    const later = await newBatch({ lotNumber: "LATER", expiresOn: new Date(`${addDays(today(), 200)}T00:00:00Z`) });
    const expired = await newBatch({
      lotNumber: "OLD",
      inspectionStatus: "QUARANTINED",
      statusReason: "Expired",
      expiresOn: new Date(`${addDays(today(), -5)}T00:00:00Z`),
    });
    await post(adjust(line(later.id, 1), line(soon.id, 1), line(expired.id, 1, { status: "QUARANTINED" })));
    const legacy = await legacyStock(noExpiryVariantId, [{ status: "SELLABLE", quantity: 1 }]);

    const all = await listBatches(invSa, {});
    expect(all.rows.map((r) => r.lotNumber ?? "LEGACY")).toEqual(["OLD", "SOON", "LATER", "LEGACY"]);
    expect((await listBatches(invSa, { expiry: "expiring" })).rows.map((r) => r.lotNumber)).toEqual(["SOON"]);
    expect((await listBatches(invSa, { expiry: "expiring", days: "365" })).rows.map((r) => r.lotNumber)).toEqual([
      "SOON",
      "LATER",
    ]);
    expect((await listBatches(invSa, { expiry: "expired" })).rows.map((r) => r.lotNumber)).toEqual(["OLD"]);
    expect((await listBatches(invSa, { expiry: "unknown" })).rows.map((r) => r.id)).toEqual([legacy.id]);
    expect((await listBatches(invSa, { incomplete: "1" })).rows.map((r) => r.id)).toEqual([legacy.id]);
    expect((await listBatches(invSa, { status: "QUARANTINED" })).rows.map((r) => r.lotNumber)).toEqual(["OLD"]);
    expect((await listBatches(invSa, { q: "soo" })).rows.map((r) => r.lotNumber)).toEqual(["SOON"]);
    expect(all.rows.find((r) => r.lotNumber === "SOON")).toMatchObject({
      eligibility: { eligible: true },
      quantities: { SELLABLE: 1 },
    });
    expect((await listBatchesFefo(db, variantId, f.warehouseId)).map((b) => b.lotNumber)).toEqual([
      "OLD",
      "SOON",
      "LATER",
    ]);
  });

  it("is scoped like the stock pages", async () => {
    const batch = await newBatch();
    await post(adjust(line(batch.id, 2)));
    expect((await listBatches(invEg, {})).rows).toEqual([]);
    expect(await getBatch(invEg, batch.id)).toBeNull();
    expect((await errorOf(listBatches(f.catalogManager, {}))).code).toBe("FORBIDDEN");
    const viewAsManager = (await getBatch(f.saManager, batch.id))!;
    expect(viewAsManager.canManage).toBe(false);
    expect(viewAsManager.balances[0]).toMatchObject({ onHand: 2, availableForSale: 2 });
    const asInventory = (await getBatch(invSa, batch.id))!;
    expect(asInventory.canManage).toBe(true);
  });
});
