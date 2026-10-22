import { beforeEach, describe, expect, it } from "vitest";
import { systemContext, type ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import {
  cancelApprovalRequest,
  decideApprovalRequest,
  getApprovalRequest,
  listApprovalRequests,
  submitApprovalRequest,
} from "@/server/modules/approvals/approvals.service";
import { auditEntries, contextFor, createStaff, seedFixture, type Fixture } from "./fixtures";

let f: Fixture;
let requester: ServiceContext; // warehouse staff at SA-WH-1: may request, may not approve
let inventoryManager: ServiceContext; // SA-WH-1: may request and approve
let saApprover2: ServiceContext; // second SA business manager
let egManager: ServiceContext; // business manager scoped to Egypt
let otherWarehouseStaff: ServiceContext;
let otherWarehouseId: string;

beforeEach(async () => {
  f = await seedFixture();
  const otherWarehouse = await db.warehouse.create({
    data: {
      code: "SA-WH-2",
      legalEntityId: f.legalEntitySaId,
      countryCode: "SA",
      nameEn: "Second warehouse",
      nameAr: "مستودع ثان",
      timezone: "Asia/Riyadh",
    },
  });
  otherWarehouseId = otherWarehouse.id;
  const warehouse = { type: "WAREHOUSE" as const, warehouseId: f.warehouseId };
  requester = contextFor(await createStaff("staff.wh1@test.local", "warehouse_staff", warehouse));
  inventoryManager = contextFor(await createStaff("im.wh1@test.local", "inventory_manager", warehouse));
  saApprover2 = contextFor(
    await createStaff("manager2.sa@test.local", "business_manager", { type: "COUNTRY", countryCode: "SA" }),
  );
  egManager = contextFor(
    await createStaff("manager.eg@test.local", "business_manager", { type: "COUNTRY", countryCode: "EG" }),
  );
  otherWarehouseStaff = contextFor(
    await createStaff("staff.wh2@test.local", "warehouse_staff", { type: "WAREHOUSE", warehouseId: otherWarehouseId }),
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

/** Raw database error, for checks that bypass the service. */
async function dbErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).message);
  }
  throw new Error("expected the statement to fail");
}

const userIdOf = (ctx: ServiceContext) => (ctx.actor.kind === "user" ? ctx.actor.userId : "");

function adjustmentInput(overrides: Record<string, unknown> = {}) {
  return {
    subjectType: "inventory.adjustment",
    subjectId: "ADJ-0001",
    summary: "Write off 2 damaged units of PF-OUD-50",
    reason: "Bottles broken in the warehouse",
    snapshot: { sku: "PF-OUD-50", quantity: -2 },
    scope: { warehouseId: f.warehouseId },
    ...overrides,
  };
}

const submit = (ctx: ServiceContext, overrides: Record<string, unknown> = {}) =>
  db.$transaction((tx) => submitApprovalRequest(tx, ctx, adjustmentInput(overrides)));

const decide = (ctx: ServiceContext, id: string, input: Record<string, unknown>) =>
  db.$transaction((tx) => decideApprovalRequest(tx, ctx, id, input));

const cancel = (ctx: ServiceContext, id: string, input: Record<string, unknown> = {}) =>
  db.$transaction((tx) => cancelApprovalRequest(tx, ctx, id, input));

describe("submitting an approval request", () => {
  it("records the request with its full scope hierarchy, a history entry and an audit entry", async () => {
    const { id } = await submit(requester);
    const request = await db.approvalRequest.findUniqueOrThrow({ where: { id }, include: { actions: true } });
    expect(request).toMatchObject({
      status: "PENDING",
      warehouseId: f.warehouseId,
      legalEntityId: f.legalEntitySaId,
      countryCode: "SA",
      requestedById: userIdOf(requester),
      decidedById: null,
      decidedAt: null,
    });
    expect(request.actions.map((action) => action.action)).toEqual(["SUBMITTED"]);
    const [audit] = await auditEntries("approvals.request.submit");
    expect(audit).toMatchObject({
      entityId: id,
      actorUserId: userIdOf(requester),
      reason: "Bottles broken in the warehouse",
    });
  });

  it("requires the subject's request permission at a scope covering the subject", async () => {
    // A country manager can approve adjustments but not request them.
    expect(await errorOf(submit(f.saManager))).toBeInstanceOf(ForbiddenError);
    // Warehouse staff of another warehouse are out of scope.
    expect(await errorOf(submit(otherWarehouseStaff))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(submit(f.cashier))).toBeInstanceOf(ForbiddenError);
    expect(await db.approvalRequest.count()).toBe(0);
  });

  it("refuses unknown subject types, blank reasons, inconsistent scopes and non-human actors", async () => {
    expect(await errorOf(submit(requester, { subjectType: "inventory.anything" }))).toBeInstanceOf(ValidationError);
    expect((await errorOf(submit(requester, { reason: "   " }))).fieldErrors).toHaveProperty("reason");
    const inconsistent = await errorOf(submit(requester, { scope: { warehouseId: f.warehouseId, countryCode: "EG" } }));
    expect(inconsistent.messageKey).toBe("errors.referenceInvalid");
    expect(await errorOf(submit(systemContext("job")))).toBeInstanceOf(ForbiddenError);
  });

  it("allows only one pending request per subject", async () => {
    const { id } = await submit(requester);
    expect(await errorOf(submit(inventoryManager))).toBeInstanceOf(ConflictError);
    await decide(f.saManager, id, { decision: "REJECT", reason: "Count again first" });
    await expect(submit(requester)).resolves.toHaveProperty("id");
  });

  it("rolls back with the subject's transaction", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await submitApprovalRequest(tx, requester, adjustmentInput());
        throw new Error("subject write failed");
      }),
    ).rejects.toThrow("subject write failed");
    expect(await db.approvalRequest.count()).toBe(0);
    expect(await db.approvalAction.count()).toBe(0);
    expect(await auditEntries("approvals.request.submit")).toHaveLength(0);
  });
});

describe("separation of duties", () => {
  it("never lets the requester approve or reject their own request, even with the approve permission", async () => {
    const { id } = await submit(inventoryManager);
    const approve = await errorOf(decide(inventoryManager, id, { decision: "APPROVE" }));
    expect(approve).toBeInstanceOf(InvalidStateError);
    expect(approve.messageKey).toBe("errors.approval.selfDecision");
    const reject = await errorOf(decide(inventoryManager, id, { decision: "REJECT", reason: "Changed my mind" }));
    expect(reject.messageKey).toBe("errors.approval.selfDecision");
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    expect(await auditEntries("approvals.request.approve")).toHaveLength(0);
  });

  it("is enforced by the database even if the service is bypassed", async () => {
    const { id } = await submit(inventoryManager);
    const message = await dbErrorOf(
      db.approvalRequest.update({
        where: { id },
        data: { status: "APPROVED", decidedById: userIdOf(inventoryManager), decidedAt: new Date() },
      }),
    );
    expect(message).toContain("approval_requests_requester_cannot_decide");
  });

  it("lets another user with the permission decide", async () => {
    const { id } = await submit(inventoryManager);
    await expect(decide(f.saManager, id, { decision: "APPROVE" })).resolves.toMatchObject({ status: "APPROVED" });
  });
});

describe("deciding a request", () => {
  it("requires the approve permission at a scope covering the request", async () => {
    const { id } = await submit(requester);
    expect(await errorOf(decide(requester, id, { decision: "APPROVE" }))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(decide(egManager, id, { decision: "APPROVE" }))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(decide(f.catalogManager, id, { decision: "APPROVE" }))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(decide(systemContext("job"), id, { decision: "APPROVE" }))).toBeInstanceOf(ForbiddenError);
  });

  it("approves with an audit entry and a history entry", async () => {
    const { id } = await submit(requester);
    const result = await decide(inventoryManager, id, { decision: "APPROVE", reason: "Verified on site" });
    expect(result).toEqual({ id, subjectType: "inventory.adjustment", subjectId: "ADJ-0001", status: "APPROVED" });
    const request = await db.approvalRequest.findUniqueOrThrow({
      where: { id },
      include: { actions: { orderBy: { occurredAt: "asc" } } },
    });
    expect(request).toMatchObject({ decidedById: userIdOf(inventoryManager), decisionReason: "Verified on site" });
    expect(request.decidedAt).toBeInstanceOf(Date);
    expect(request.actions.map((action) => action.action)).toEqual(["SUBMITTED", "APPROVED"]);
    const [audit] = await auditEntries("approvals.request.approve");
    expect(audit).toMatchObject({
      entityId: id,
      actorUserId: userIdOf(inventoryManager),
      after: { status: "APPROVED" },
    });
  });

  it("requires a reason to reject", async () => {
    const { id } = await submit(requester);
    const error = await errorOf(decide(f.saManager, id, { decision: "REJECT" }));
    expect(error.fieldErrors).toHaveProperty("reason");
    await decide(f.saManager, id, { decision: "REJECT", reason: "Quantity does not match the count" });
    expect(await db.approvalRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "REJECTED",
      decisionReason: "Quantity does not match the count",
    });
    expect(await auditEntries("approvals.request.reject")).toHaveLength(1);
  });

  it("treats a decision as final", async () => {
    const { id } = await submit(requester);
    await decide(f.saManager, id, { decision: "APPROVE" });
    const again = await errorOf(decide(saApprover2, id, { decision: "REJECT", reason: "Too late" }));
    expect(again.messageKey).toBe("errors.approval.notPending");
    expect(await errorOf(cancel(requester, id))).toBeInstanceOf(InvalidStateError);
    const message = await dbErrorOf(db.approvalRequest.update({ where: { id }, data: { decisionReason: "edited" } }));
    expect(message).toContain("already APPROVED");
  });

  it("lets exactly one of two concurrent approvers win", async () => {
    const { id } = await submit(requester);
    const results = await Promise.allSettled([
      decide(f.saManager, id, { decision: "APPROVE" }),
      decide(saApprover2, id, { decision: "REJECT", reason: "Not needed" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(InvalidStateError);
    const actions = await db.approvalAction.findMany({ where: { requestId: id } });
    expect(actions).toHaveLength(2);
  });

  it("rolls back the decision with the subject's transaction", async () => {
    const { id } = await submit(requester);
    await expect(
      db.$transaction(async (tx) => {
        await decideApprovalRequest(tx, f.saManager, id, { decision: "APPROVE" });
        throw new Error("applying the adjustment failed");
      }),
    ).rejects.toThrow("applying the adjustment failed");
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    expect(await auditEntries("approvals.request.approve")).toHaveLength(0);
  });

  it("reports unknown ids as not found", async () => {
    expect(await errorOf(decide(f.saManager, "not-a-uuid", { decision: "APPROVE" }))).toBeInstanceOf(NotFoundError);
    expect(
      await errorOf(decide(f.saManager, "0199f000-0000-7000-8000-000000000000", { decision: "APPROVE" })),
    ).toBeInstanceOf(NotFoundError);
  });
});

describe("cancelling a request", () => {
  it("is limited to the requester or a system actor", async () => {
    const { id } = await submit(requester);
    expect(await errorOf(cancel(f.saManager, id))).toBeInstanceOf(ForbiddenError);
    await expect(cancel(requester, id, { reason: "Entered twice" })).resolves.toMatchObject({ status: "CANCELLED" });
    expect(await db.approvalRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      decidedById: userIdOf(requester),
      decisionReason: "Entered twice",
    });

    const second = await submit(requester, { subjectId: "ADJ-0002" });
    await cancel(systemContext("adjustment-voided"), second.id);
    const actions = await db.approvalAction.findMany({ where: { requestId: second.id, action: "CANCELLED" } });
    expect(actions).toMatchObject([{ actorType: "SYSTEM", actorUserId: null }]);
    expect(await auditEntries("approvals.request.cancel")).toHaveLength(2);
  });
});

describe("integrity of the history", () => {
  it("refuses updates and deletes of approval actions and deletes of requests", async () => {
    const { id } = await submit(requester);
    const message = await dbErrorOf(db.approvalAction.updateMany({ where: { requestId: id }, data: { reason: "x" } }));
    expect(message).toContain("append-only");
    expect(await dbErrorOf(db.approvalAction.deleteMany({ where: { requestId: id } }))).toContain("append-only");
    expect(await dbErrorOf(db.approvalRequest.delete({ where: { id } }))).toContain("cannot be deleted");
    expect(
      await dbErrorOf(db.approvalRequest.update({ where: { id }, data: { summary: "Write off 20 units" } })),
    ).toContain("cannot change");
  });
});

describe("visibility", () => {
  it("shows requests to their requester and to approvers in scope only", async () => {
    const { id } = await submit(requester);
    const ids = async (ctx: ServiceContext) => (await listApprovalRequests(ctx)).map((request) => request.id);
    expect(await ids(requester)).toEqual([id]);
    expect(await ids(f.saManager)).toEqual([id]);
    expect(await ids(inventoryManager)).toEqual([id]);
    expect(await ids(f.superAdmin)).toEqual([id]);
    expect(await ids(egManager)).toEqual([]);
    expect(await ids(otherWarehouseStaff)).toEqual([]);
    expect(await ids(f.cashier)).toEqual([]);

    const detail = await getApprovalRequest(f.saManager, id);
    expect(detail.actions.map((action) => action.action)).toEqual(["SUBMITTED"]);
    expect(detail.snapshot).toEqual({ sku: "PF-OUD-50", quantity: -2 });
    expect(await errorOf(getApprovalRequest(egManager, id))).toBeInstanceOf(NotFoundError);
  });

  it("filters by status", async () => {
    const { id } = await submit(requester);
    await submit(requester, { subjectId: "ADJ-0002" });
    await decide(f.saManager, id, { decision: "APPROVE" });
    const pending = await listApprovalRequests(f.saManager, { status: "PENDING" });
    expect(pending.map((request) => request.subjectId)).toEqual(["ADJ-0002"]);
  });
});
