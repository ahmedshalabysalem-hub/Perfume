import { beforeEach, describe, expect, it } from "vitest";
import { systemContext, type ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { postStockMovements, type StockPosting } from "@/server/modules/inventory/ledger";
import { getVariantStock, listStock, postOpeningBalance } from "@/server/modules/inventory/stock.service";
import { auditEntries, contextFor, createStaff, seedFixture, type Fixture } from "./fixtures";

let f: Fixture;
let variantId: string;
let untrackedVariantId: string;
let egWarehouseId: string;
const system = systemContext("inventory-test");

beforeEach(async () => {
  f = await seedFixture();
  const brand = await db.brand.create({ data: { slug: "house", nameEn: "House", nameAr: "دار" } });
  const product = await db.product.create({
    data: { slug: "royal-oud", brandId: brand.id, nameEn: "Royal Oud", nameAr: "عود ملكي", searchText: "royal oud" },
  });
  variantId = (
    await db.productVariant.create({
      data: {
        productId: product.id,
        sku: "ROI-100",
        barcode: "PF0000001",
        barcodeType: "CODE_128",
        barcodeSource: "INTERNAL",
      },
    })
  ).id;
  untrackedVariantId = (
    await db.productVariant.create({
      data: { productId: product.id, sku: "ROI-GIFTWRAP", trackInventory: false, trackBatches: false },
    })
  ).id;
  const egEntity = await db.legalEntity.create({
    data: { code: "TEST-EG", countryCode: "EG", legalNameEn: "Test EG", legalNameAr: "اختبار مصر" },
  });
  egWarehouseId = (
    await db.warehouse.create({
      data: {
        code: "EG-WH-1",
        legalEntityId: egEntity.id,
        countryCode: "EG",
        nameEn: "Cairo",
        nameAr: "القاهرة",
        timezone: "Africa/Cairo",
      },
    })
  ).id;
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

function post(ctx: ServiceContext, posting: StockPosting) {
  return db.$transaction((tx) => postStockMovements(tx, ctx, posting));
}

async function balance(warehouseId = f.warehouseId, status: "SELLABLE" | "QUARANTINED" = "SELLABLE") {
  return db.stockBalance.findUnique({
    where: { variantId_warehouseId_status: { variantId, warehouseId, status } },
  });
}

const receive = (key: string, quantity: number, warehouseId = f.warehouseId): StockPosting => ({
  type: "ADJUSTMENT",
  idempotencyKey: key,
  lines: [{ variantId, warehouseId, status: "SELLABLE", quantity }],
});

describe("stock ledger", () => {
  it("creates the balance and the movement together, with the running balance", async () => {
    const first = await post(system, receive("in-1", 10));
    const second = await post(system, receive("in-2", 5));
    expect(first.movements[0]).toMatchObject({ quantity: 10, balanceAfter: 10 });
    expect(second.movements[0]).toMatchObject({ quantity: 5, balanceAfter: 15 });
    expect((await balance())?.onHand).toBe(15);
    const movement = await db.stockMovement.findUniqueOrThrow({ where: { id: first.movements[0]!.id } });
    expect(movement).toMatchObject({ actorType: "SYSTEM", actorUserId: null, idempotencyKey: "in-1", lineNo: 1 });
  });

  it("rejects taking more than is available and leaves nothing behind", async () => {
    await post(system, receive("in", 3));
    const error = await errorOf(post(system, receive("out", -4)));
    expect(error.messageKey).toBe("errors.invalidState.insufficientStock");
    expect(error.details).toMatchObject({ sku: "ROI-100" });
    expect((await balance())?.onHand).toBe(3);
    expect(await db.stockMovement.count()).toBe(1);
  });

  it("rejects an outbound movement when no balance exists", async () => {
    const error = await errorOf(post(system, receive("out", -1)));
    expect(error.messageKey).toBe("errors.invalidState.insufficientStock");
  });

  it("rolls back the movements when the caller's transaction fails afterwards", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await postStockMovements(tx, system, receive("doomed", 5));
        throw new Error("document save failed");
      }),
    ).rejects.toThrow("document save failed");
    expect(await balance()).toBeNull();
    expect(await db.stockMovement.count()).toBe(0);
  });

  it("rolls back every line when one line fails", async () => {
    await post(system, receive("in", 2));
    const error = await errorOf(
      post(system, {
        type: "ADJUSTMENT",
        idempotencyKey: "status-change",
        lines: [
          { variantId, warehouseId: f.warehouseId, status: "QUARANTINED", quantity: 5 },
          { variantId, warehouseId: f.warehouseId, status: "SELLABLE", quantity: -5 },
        ],
      }),
    );
    expect(error.messageKey).toBe("errors.invalidState.insufficientStock");
    expect(await balance(f.warehouseId, "QUARANTINED")).toBeNull();
    expect((await balance())?.onHand).toBe(2);
  });

  it("moves stock between statuses as two lines of one posting", async () => {
    await post(system, receive("in", 6));
    const result = await post(system, {
      type: "ADJUSTMENT",
      idempotencyKey: "quarantine",
      document: { type: "inspection", id: "INS-1" },
      lines: [
        { variantId, warehouseId: f.warehouseId, status: "SELLABLE", quantity: -2 },
        { variantId, warehouseId: f.warehouseId, status: "QUARANTINED", quantity: 2 },
      ],
    });
    expect(result.movements.map((m) => [m.lineNo, m.status, m.balanceAfter])).toEqual([
      [1, "SELLABLE", 4],
      [2, "QUARANTINED", 2],
    ]);
  });

  it("does not let reserved stock leave", async () => {
    await post(system, receive("in", 5));
    await db.stockBalance.update({ where: { id: (await balance())!.id }, data: { reserved: 4 } });
    expect((await errorOf(post(system, receive("out", -2)))).messageKey).toBe("errors.invalidState.insufficientStock");
    await post(system, receive("out-ok", -1));
    expect((await balance())?.onHand).toBe(4);
  });

  it("treats a repeated posting as a no-op and a changed one as a conflict", async () => {
    const first = await post(system, receive("order:1:ship", 7));
    const again = await post(system, receive("order:1:ship", 7));
    expect(again.replayed).toBe(true);
    expect(again.movements.map((m) => m.id)).toEqual(first.movements.map((m) => m.id));
    expect((await balance())?.onHand).toBe(7);

    const error = await errorOf(post(system, receive("order:1:ship", 8)));
    expect(error.messageKey).toBe("errors.conflict.stockPosting");
    expect(await db.stockMovement.count()).toBe(1);
  });

  it("records unit cost in the warehouse country's currency and compares replays exactly", async () => {
    const posting: StockPosting = {
      type: "ADJUSTMENT",
      idempotencyKey: "costed",
      lines: [{ variantId, warehouseId: egWarehouseId, status: "SELLABLE", quantity: 3, unitCost: "12.5" }],
    };
    await post(system, posting);
    const movement = await db.stockMovement.findFirstOrThrow({ where: { idempotencyKey: "costed" } });
    expect(movement.unitCost?.toFixed(4)).toBe("12.5000");
    expect(movement.currencyCode).toBe("EGP");
    expect((await post(system, posting)).replayed).toBe(true);
  });

  it("refuses variants that do not track inventory", async () => {
    const error = await errorOf(
      post(system, {
        type: "ADJUSTMENT",
        idempotencyKey: "untracked",
        lines: [{ variantId: untrackedVariantId, warehouseId: f.warehouseId, status: "SELLABLE", quantity: 1 }],
      }),
    );
    expect(error.messageKey).toBe("errors.invalidState.inventoryNotTracked");
  });

  it("rejects malformed postings before touching the database", async () => {
    await expect(post(system, receive("zero", 0))).rejects.toThrow(/quantity/);
    await expect(post(system, receive("fraction", 1.5))).rejects.toThrow(/quantity/);
    await expect(post(system, { ...receive("", 1), idempotencyKey: " " })).rejects.toThrow(/idempotencyKey/);
    await expect(
      post(system, {
        ...receive("precise", 1),
        lines: [{ variantId, warehouseId: f.warehouseId, status: "SELLABLE", quantity: 1, unitCost: "1.00001" }],
      }),
    ).rejects.toThrow(/unit cost/);
    expect(await db.stockMovement.count()).toBe(0);
  });

  it("never oversells under concurrent withdrawals", async () => {
    await post(system, receive("in", 5));
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) => post(system, receive(`sale-${index}`, -1))),
    );
    const succeeded = attempts.filter((attempt) => attempt.status === "fulfilled").length;
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    expect(succeeded).toBe(5);
    for (const failure of failures) {
      expect((failure as PromiseRejectedResult).reason).toMatchObject({
        messageKey: "errors.invalidState.insufficientStock",
      });
    }
    expect((await balance())?.onHand).toBe(0);
    const ledger = await db.stockMovement.aggregate({ where: { variantId }, _sum: { quantity: true } });
    expect(ledger._sum.quantity).toBe(0);
  });

  it("applies concurrent retries of the same posting once", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => post(system, receive("webhook:42", 4))));
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect((await balance())?.onHand).toBe(4);
    expect(await db.stockMovement.count()).toBe(1);
  });

  it("keeps concurrent receipts consistent with the ledger", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        post(system, {
          type: "ADJUSTMENT",
          idempotencyKey: `mixed-${index}`,
          lines: [
            { variantId, warehouseId: egWarehouseId, status: "SELLABLE", quantity: 2 },
            { variantId, warehouseId: f.warehouseId, status: "SELLABLE", quantity: 3 },
          ],
        }),
      ),
    );
    expect((await balance())?.onHand).toBe(30);
    expect((await balance(egWarehouseId))?.onHand).toBe(20);
  });
});

describe("ledger integrity in the database", () => {
  it("forbids updating or deleting movements", async () => {
    await post(system, receive("in", 1));
    await expect(db.$executeRawUnsafe(`UPDATE "stock_movements" SET "quantity" = 99`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "stock_movements"`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`TRUNCATE "stock_movements"`)).rejects.toThrow(/append-only/);
  });

  it("forbids negative balances and over-reservation even outside the service", async () => {
    await post(system, receive("in", 2));
    const id = (await balance())!.id;
    await expect(db.stockBalance.update({ where: { id }, data: { onHand: -1 } })).rejects.toThrow();
    await expect(db.stockBalance.update({ where: { id }, data: { reserved: 3 } })).rejects.toThrow();
  });
});

describe("opening balances", () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    variantCode: "pf0000001",
    warehouseId: f.warehouseId,
    status: "SELLABLE",
    quantity: "24",
    unitCost: "85.5",
    reason: "Go-live stock count",
    ...overrides,
  });

  it("posts stock found by barcode, with cost and an audit entry", async () => {
    const manager = contextFor(
      await createStaff("inv@test.local", "inventory_manager", { type: "WAREHOUSE", warehouseId: f.warehouseId }),
    );
    const { movementId } = await postOpeningBalance(manager, input());
    const movement = await db.stockMovement.findUniqueOrThrow({ where: { id: movementId } });
    expect(movement).toMatchObject({ type: "OPENING_BALANCE", quantity: 24, balanceAfter: 24, currencyCode: "SAR" });
    expect(movement.unitCost?.toFixed(4)).toBe("85.5000");
    expect(movement.reason).toBe("Go-live stock count");
    const [audit] = await auditEntries("inventory.opening_balance.post");
    expect(audit).toMatchObject({ entityId: movementId, reason: "Go-live stock count" });
  });

  it("is allowed once per variant, warehouse and status", async () => {
    await postOpeningBalance(f.superAdmin, input());
    const error = await errorOf(postOpeningBalance(f.superAdmin, input({ quantity: "1" })));
    expect(error.messageKey).toBe("errors.invalidState.openingBalanceExists");
    await postOpeningBalance(f.superAdmin, input({ status: "DAMAGED", quantity: "2" }));
    expect((await balance())?.onHand).toBe(24);
  });

  it("is refused once the balance has other history", async () => {
    await post(system, receive("in", 1));
    const error = await errorOf(postOpeningBalance(f.superAdmin, input()));
    expect(error.messageKey).toBe("errors.invalidState.openingBalanceExists");
  });

  it("enforces permission and warehouse scope", async () => {
    expect((await errorOf(postOpeningBalance(f.catalogManager, input()))).code).toBe("FORBIDDEN");
    const egOnly = contextFor(
      await createStaff("inv.eg@test.local", "inventory_manager", { type: "COUNTRY", countryCode: "EG" }),
    );
    expect((await errorOf(postOpeningBalance(egOnly, input()))).code).toBe("FORBIDDEN");
    await postOpeningBalance(egOnly, input({ warehouseId: egWarehouseId }));
    // Warehouse staff can view stock but not enter opening balances.
    const staff = contextFor(
      await createStaff("wh@test.local", "warehouse_staff", { type: "WAREHOUSE", warehouseId: f.warehouseId }),
    );
    expect((await errorOf(postOpeningBalance(staff, input()))).code).toBe("FORBIDDEN");
    expect(await db.stockMovement.count()).toBe(1);
  });

  it("validates the input and the referenced records", async () => {
    const invalid = await errorOf(postOpeningBalance(f.superAdmin, input({ quantity: "0", unitCost: "1.23456" })));
    expect(invalid.code).toBe("VALIDATION");
    expect(Object.keys(invalid.fieldErrors ?? {}).sort()).toEqual(["quantity", "unitCost"]);
    expect((await errorOf(postOpeningBalance(f.superAdmin, input({ reason: "" })))).code).toBe("VALIDATION");
    const unknown = await errorOf(postOpeningBalance(f.superAdmin, input({ variantCode: "NOPE-1" })));
    expect(unknown.fieldErrors).toEqual({ variantCode: ["errors.inventory.variantNotFound"] });
    await db.warehouse.update({ where: { id: f.warehouseId }, data: { isActive: false } });
    expect((await errorOf(postOpeningBalance(f.superAdmin, input()))).messageKey).toBe(
      "errors.invalidState.inactiveReference",
    );
  });

  it("accepts a zero unit cost (free samples)", async () => {
    await postOpeningBalance(f.superAdmin, input({ unitCost: "0" }));
    expect((await balance())?.onHand).toBe(24);
  });

  it("serialises concurrent openings of the same balance", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => postOpeningBalance(f.superAdmin, input())),
    );
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect((await balance())?.onHand).toBe(24);
  });
});

describe("stock queries", () => {
  beforeEach(async () => {
    await post(system, receive("sa", 4));
    await post(system, receive("eg", 9, egWarehouseId));
  });

  it("lists balances within the actor's scope", async () => {
    const all = await listStock(f.superAdmin, {});
    expect(all.rows.map((row) => [row.warehouse.code, row.onHand, row.available])).toEqual([
      ["EG-WH-1", 9, 9],
      ["SA-WH-1", 4, 4],
    ]);
    const saManager = await listStock(f.saManager, {});
    expect(saManager.rows.map((row) => row.warehouse.code)).toEqual(["SA-WH-1"]);
    const staff = contextFor(
      await createStaff("wh@test.local", "warehouse_staff", { type: "WAREHOUSE", warehouseId: egWarehouseId }),
    );
    expect((await listStock(staff, {})).rows.map((row) => row.warehouse.code)).toEqual(["EG-WH-1"]);
    const entity = contextFor(
      await createStaff("inv.le@test.local", "inventory_manager", {
        type: "LEGAL_ENTITY",
        legalEntityId: f.legalEntitySaId,
      }),
    );
    expect((await listStock(entity, {})).rows.map((row) => row.warehouse.code)).toEqual(["SA-WH-1"]);
    // The SA manager cannot widen the scope with a filter.
    expect((await listStock(f.saManager, { warehouse: egWarehouseId })).rows).toEqual([]);
  });

  it("finds stock by barcode, SKU fragment or product name, and filters by status", async () => {
    expect((await listStock(f.superAdmin, { q: "PF0000001" })).rows).toHaveLength(2);
    expect((await listStock(f.superAdmin, { q: "roi" })).rows).toHaveLength(2);
    expect((await listStock(f.superAdmin, { q: "Royal" })).rows).toHaveLength(2);
    expect((await listStock(f.superAdmin, { q: "missing" })).rows).toHaveLength(0);
    expect((await listStock(f.superAdmin, { status: "DAMAGED" })).rows).toHaveLength(0);
  });

  it("requires inventory.view", async () => {
    expect((await errorOf(listStock(f.catalogManager, {}))).code).toBe("FORBIDDEN");
    expect((await errorOf(getVariantStock(f.cashier, variantId, {}))).code).toBe("FORBIDDEN");
  });

  it("shows a variant's movements only for warehouses in scope", async () => {
    const all = (await getVariantStock(f.superAdmin, variantId, {}))!;
    expect(all.movements).toHaveLength(2);
    expect(all.balances).toHaveLength(2);
    expect(all.movements[0]).toMatchObject({ actorName: null, unitCost: null });
    expect(await getVariantStock(f.superAdmin, crypto.randomUUID(), {})).toBeNull();
    const sa = (await getVariantStock(f.saManager, variantId, {}))!;
    expect(sa.movements.map((m) => m.warehouse.code)).toEqual(["SA-WH-1"]);
    expect(sa.balances.map((b) => b.warehouse.code)).toEqual(["SA-WH-1"]);
  });
});
