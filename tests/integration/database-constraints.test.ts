import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { seedFixture, type Fixture } from "./fixtures";

// The CHECK constraints and triggers below are the database backstop behind
// the ledger (ADR-020) and approvals (ADR-019) services. Each case writes the
// row directly, bypassing the service, so a missing or weakened constraint
// fails here even while the service validation still hides it.

let f: Fixture;
let variantId: string;
let requesterId: string;
let approverId: string;

beforeEach(async () => {
  f = await seedFixture();
  const brand = await db.brand.create({ data: { slug: "house", nameEn: "House", nameAr: "دار" } });
  const product = await db.product.create({
    data: { slug: "royal-oud", brandId: brand.id, nameEn: "Royal Oud", nameAr: "عود ملكي", searchText: "royal oud" },
  });
  variantId = (await db.productVariant.create({ data: { productId: product.id, sku: "ROI-100", trackBatches: false } }))
    .id;
  requesterId = f.cashier.actor.kind === "user" ? f.cashier.actor.userId : "";
  approverId = f.saManager.actor.kind === "user" ? f.saManager.actor.userId : "";
});

/** Raw database error message, for statements that must be refused. */
async function dbErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).message);
  }
  throw new Error("expected the statement to fail");
}

type MovementColumns = {
  type: string;
  status: string;
  quantity: number;
  balanceAfter: number;
  unitCost: string | null;
  currencyCode: string | null;
  documentType: string | null;
  documentId: string | null;
  actorType: string;
  actorUserId: string | null;
  lineNo: number;
};

/** Inserts one movement row directly; the defaults are a valid system adjustment. */
function insertMovement(overrides: Partial<MovementColumns> = {}) {
  const row: MovementColumns = {
    type: "ADJUSTMENT",
    status: "SELLABLE",
    quantity: 1,
    balanceAfter: 1,
    unitCost: null,
    currencyCode: null,
    documentType: null,
    documentId: null,
    actorType: "SYSTEM",
    actorUserId: null,
    lineNo: 1,
    ...overrides,
  };
  return db.$executeRawUnsafe(
    `INSERT INTO "stock_movements" ("id", "type", "variant_id", "warehouse_id", "status", "quantity",
       "balance_after", "unit_cost", "currency_code", "document_type", "document_id", "actor_type",
       "actor_user_id", "idempotency_key", "line_no")
     VALUES (gen_random_uuid(), $1::"StockMovementType", $2::uuid, $3::uuid, $4::"StockStatus", $5, $6,
       $7::numeric, $8, $9, $10, $11::"ActorType", $12::uuid, $13, $14)`,
    row.type,
    variantId,
    f.warehouseId,
    row.status,
    row.quantity,
    row.balanceAfter,
    row.unitCost,
    row.currencyCode,
    row.documentType,
    row.documentId,
    row.actorType,
    row.actorUserId,
    `constraint-test:${crypto.randomUUID()}`,
    row.lineNo,
  );
}

describe("stock ledger constraints", () => {
  it("accepts a well-formed movement written directly", async () => {
    await expect(insertMovement()).resolves.toBe(1);
  });

  it("rejects zero quantities, negative running balances and line numbers below one", async () => {
    expect(await dbErrorOf(insertMovement({ quantity: 0 }))).toContain("stock_movements_quantity_non_zero");
    expect(await dbErrorOf(insertMovement({ balanceAfter: -1 }))).toContain(
      "stock_movements_balance_after_non_negative",
    );
    expect(await dbErrorOf(insertMovement({ lineNo: 0 }))).toContain("stock_movements_line_no_positive");
  });

  it("never stores a cost without its currency, a currency without a cost, or a negative cost", async () => {
    expect(await dbErrorOf(insertMovement({ unitCost: "10.0000" }))).toContain("stock_movements_cost_currency");
    expect(await dbErrorOf(insertMovement({ currencyCode: "SAR" }))).toContain("stock_movements_cost_currency");
    expect(await dbErrorOf(insertMovement({ unitCost: "-0.0001", currencyCode: "SAR" }))).toContain(
      "stock_movements_unit_cost_non_negative",
    );
    await expect(insertMovement({ unitCost: "0.0000", currencyCode: "SAR" })).resolves.toBe(1);
  });

  it("allows opening balances only as inbound stock at a known cost", async () => {
    expect(await dbErrorOf(insertMovement({ type: "OPENING_BALANCE" }))).toContain(
      "stock_movements_opening_balance_inbound",
    );
    expect(
      await dbErrorOf(
        insertMovement({ type: "OPENING_BALANCE", quantity: -1, unitCost: "5.0000", currencyCode: "SAR" }),
      ),
    ).toContain("stock_movements_opening_balance_inbound");
    await expect(insertMovement({ type: "OPENING_BALANCE", unitCost: "5.0000", currencyCode: "SAR" })).resolves.toBe(1);
  });

  it("ties user actors to a user id and documents to both a type and an id", async () => {
    expect(await dbErrorOf(insertMovement({ actorType: "USER" }))).toContain("stock_movements_actor_consistency");
    expect(await dbErrorOf(insertMovement({ actorUserId: requesterId }))).toContain(
      "stock_movements_actor_consistency",
    );
    expect(await dbErrorOf(insertMovement({ documentType: "order" }))).toContain("stock_movements_document_pair");
    expect(await dbErrorOf(insertMovement({ documentId: "ORD-1" }))).toContain("stock_movements_document_pair");
  });

  it("allows reservations on sellable stock only", async () => {
    const balance = (status: string, reserved: number) =>
      db.$executeRawUnsafe(
        `INSERT INTO "stock_balances" ("id", "variant_id", "warehouse_id", "status", "on_hand", "reserved", "updated_at")
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::"StockStatus", 5, $4, now())`,
        variantId,
        f.warehouseId,
        status,
        reserved,
      );
    expect(await dbErrorOf(balance("QUARANTINED", 1))).toContain("stock_balances_reserved_only_sellable");
    await expect(balance("SELLABLE", 1)).resolves.toBe(1);
  });

  it("refuses to truncate the ledger unless the purge switch is on", async () => {
    await insertMovement();
    expect(
      await dbErrorOf(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL app.stock_ledger_purge = 'off'");
          await tx.$executeRawUnsafe(`TRUNCATE "stock_movements"`);
        }),
      ),
    ).toContain("append-only");
    expect(await db.stockMovement.count()).toBe(1);
  });
});

describe("approval constraints", () => {
  async function pendingRequest() {
    return db.approvalRequest.create({
      data: {
        subjectType: "inventory.adjustment",
        subjectId: `ADJ-${crypto.randomUUID().slice(0, 8)}`,
        countryCode: "SA",
        legalEntityId: f.legalEntitySaId,
        warehouseId: f.warehouseId,
        summary: "Write off 2 damaged units",
        requestReason: "Bottles broken in the warehouse",
        requestedById: requesterId,
      },
    });
  }

  it("refuses a rejection without a reason", async () => {
    const { id } = await pendingRequest();
    const reject = (decisionReason: string | null) =>
      db.approvalRequest.update({
        where: { id },
        data: { status: "REJECTED", decidedById: approverId, decidedAt: new Date(), decisionReason },
      });
    expect(await dbErrorOf(reject(null))).toContain("approval_requests_rejection_has_reason");
    expect(await dbErrorOf(reject("   "))).toContain("approval_requests_rejection_has_reason");
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("lets only the requester or a system actor cancel", async () => {
    const { id } = await pendingRequest();
    expect(
      await dbErrorOf(
        db.approvalRequest.update({
          where: { id },
          data: { status: "CANCELLED", decidedById: approverId, decidedAt: new Date() },
        }),
      ),
    ).toContain("approval_requests_cancelled_by_requester");
    await expect(
      db.approvalRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } }),
    ).resolves.toMatchObject({ status: "CANCELLED", decidedById: null });
  });

  it("ties user actions to a user id", async () => {
    const { id } = await pendingRequest();
    expect(
      await dbErrorOf(db.approvalAction.create({ data: { requestId: id, action: "SUBMITTED", actorType: "USER" } })),
    ).toContain("approval_actions_actor_consistency");
    expect(
      await dbErrorOf(
        db.approvalAction.create({
          data: { requestId: id, action: "SUBMITTED", actorType: "SYSTEM", actorUserId: requesterId },
        }),
      ),
    ).toContain("approval_actions_actor_consistency");
  });

  it("refuses to truncate the action history unless the retention switch is on", async () => {
    const { id } = await pendingRequest();
    await db.approvalAction.create({
      data: { requestId: id, action: "SUBMITTED", actorType: "USER", actorUserId: requesterId },
    });
    expect(
      await dbErrorOf(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL app.audit_retention_purge = 'off'");
          await tx.$executeRawUnsafe(`TRUNCATE "approval_actions"`);
        }),
      ),
    ).toContain("append-only");
    expect(await db.approvalAction.count({ where: { requestId: id } })).toBe(1);
  });
});

describe("audit log constraints", () => {
  it("refuses to truncate the audit log unless the retention switch is on", async () => {
    await db.auditLog.create({ data: { action: "test.constraint", entityType: "test", actorType: "SYSTEM" } });
    expect(
      await dbErrorOf(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL app.audit_retention_purge = 'off'");
          await tx.$executeRawUnsafe(`TRUNCATE "audit_logs"`);
        }),
      ),
    ).toContain("audit_logs is append-only");
    expect(await db.auditLog.count({ where: { action: "test.constraint" } })).toBe(1);
  });
});
