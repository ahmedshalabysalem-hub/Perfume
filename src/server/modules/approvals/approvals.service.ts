import "server-only";
import { approvalCancelSchema, approvalDecisionSchema, approvalSubmitSchema } from "@/lib/schemas/approvals";
import { recordAudit } from "@/server/audit/audit";
import { redactForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, Prisma, type DbClient, type Tx } from "@/server/db";
import { ConflictError, ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan, can, isStaffActor, scopeFilterFor } from "@/server/rbac/authorize";
import { scopeFilterIsEmpty, type AuthorizationTarget, type ResourceScope } from "@/server/rbac/scope";
import { isUuid, parseId, parseInput } from "@/server/validation";
import type { ApprovalStatus } from "@/generated/prisma/enums";
import { APPROVAL_SUBJECT_TYPES, APPROVAL_SUBJECTS, isApprovalSubjectType, type ApprovalSubjectType } from "./subjects";

/**
 * Generic approval workflow (APR-001, ADR-019). Modules call `submit…` and
 * `decide…` inside their own transaction so the subject's change and the
 * approval commit together; on APPROVED the caller applies the effect in the
 * same transaction. The requester can never decide their own request: this
 * service refuses it and a database CHECK backs it up.
 */

export type ApprovalScopeColumns = {
  countryCode: string | null;
  legalEntityId: string | null;
  storeId: string | null;
  warehouseId: string | null;
};

export type DecidedApproval = {
  id: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  status: ApprovalStatus;
};

function policyFor(subjectType: string) {
  if (!isApprovalSubjectType(subjectType)) {
    throw new ValidationError({ subjectType: ["validation.invalidOption"] });
  }
  return APPROVAL_SUBJECTS[subjectType];
}

/** Columns → authorisation target. A request with no scope is organisation-wide. */
export function approvalTarget(scope: ApprovalScopeColumns): AuthorizationTarget {
  const target: ResourceScope = {};
  if (scope.countryCode) target.countryCode = scope.countryCode;
  if (scope.legalEntityId) target.legalEntityId = scope.legalEntityId;
  if (scope.storeId) target.storeId = scope.storeId;
  if (scope.warehouseId) target.warehouseId = scope.warehouseId;
  return Object.keys(target).length === 0 ? "global" : target;
}

/**
 * Complete the scope hierarchy from its most specific element so approvers
 * at country or legal-entity scope are matched. Ids the caller supplied must
 * agree with the hierarchy.
 */
async function resolveScope(client: DbClient, scope: ApprovalScopeColumns): Promise<ApprovalScopeColumns> {
  const resolved = { ...scope };
  const mismatch = () => new ValidationError({ scope: ["validation.invalidReference"] }, "errors.referenceInvalid");
  const agree = (key: keyof ApprovalScopeColumns, value: string) => {
    if (resolved[key] !== null && resolved[key] !== value) throw mismatch();
    resolved[key] = value;
  };
  if (scope.warehouseId) {
    const warehouse = await client.warehouse.findUnique({ where: { id: scope.warehouseId } });
    if (!warehouse) throw mismatch();
    agree("legalEntityId", warehouse.legalEntityId);
    agree("countryCode", warehouse.countryCode);
  }
  if (scope.storeId) {
    const store = await client.store.findUnique({ where: { id: scope.storeId } });
    if (!store) throw mismatch();
    agree("legalEntityId", store.legalEntityId);
    agree("countryCode", store.countryCode);
  }
  if (resolved.legalEntityId) {
    const entity = await client.legalEntity.findUnique({ where: { id: resolved.legalEntityId } });
    if (!entity) throw mismatch();
    agree("countryCode", entity.countryCode);
  }
  if (resolved.countryCode) {
    const country = await client.country.findUnique({ where: { code: resolved.countryCode } });
    if (!country) throw mismatch();
  }
  return resolved;
}

function requireStaffUser(ctx: ServiceContext) {
  // Separation of duties needs a person on both sides of the request.
  if (!isStaffActor(ctx.actor)) throw new ForbiddenError();
  return ctx.actor;
}

/** Open an approval request for a subject. Run inside the subject's transaction. */
export async function submitApprovalRequest(tx: Tx, ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  const actor = requireStaffUser(ctx);
  const data = parseInput(approvalSubmitSchema, input);
  const policy = policyFor(data.subjectType);
  const scope = await resolveScope(tx, data.scope);
  assertCan(actor, policy.requestPermission, approvalTarget(scope));

  const pending = await tx.approvalRequest.findFirst({
    where: { subjectType: data.subjectType, subjectId: data.subjectId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) throw new ConflictError("errors.approval.alreadyPending");

  const snapshot = data.snapshot === undefined ? undefined : redactForAudit(data.snapshot);
  try {
    const request = await tx.approvalRequest.create({
      data: {
        subjectType: data.subjectType,
        subjectId: data.subjectId,
        ...scope,
        summary: data.summary,
        snapshot: snapshot === undefined || snapshot === null ? Prisma.DbNull : (snapshot as Prisma.InputJsonValue),
        requestReason: data.reason,
        requestedById: actor.userId,
      },
    });
    await tx.approvalAction.create({
      data: {
        requestId: request.id,
        action: "SUBMITTED",
        actorType: "USER",
        actorUserId: actor.userId,
        reason: data.reason,
      },
    });
    await recordAudit(tx, ctx, {
      action: "approvals.request.submit",
      entityType: "approval_request",
      entityId: request.id,
      summary: `${data.subjectType} ${data.subjectId}: ${data.summary}`,
      after: { subjectType: data.subjectType, subjectId: data.subjectId, status: request.status, ...scope, snapshot },
      reason: data.reason,
    });
    return { id: request.id };
  } catch (error) {
    // A concurrent submission for the same subject won the partial unique index.
    if (isUniqueViolationOn(error, "subject_type")) throw new ConflictError("errors.approval.alreadyPending");
    throw error;
  }
}

async function loadRequest(client: DbClient, rawId: unknown) {
  const id = parseId(rawId, "approval_request");
  const request = await client.approvalRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError("approval_request");
  return request;
}

/**
 * Approve or reject a pending request. Run inside the subject's transaction
 * and apply the subject's effect there when the result is APPROVED.
 */
export async function decideApprovalRequest(
  tx: Tx,
  ctx: ServiceContext,
  rawId: unknown,
  input: unknown,
): Promise<DecidedApproval> {
  const actor = requireStaffUser(ctx);
  const { decision, reason } = parseInput(approvalDecisionSchema, input);
  const request = await loadRequest(tx, rawId);
  const policy = policyFor(request.subjectType);
  assertCan(actor, policy.approvePermission, approvalTarget(request));
  if (request.requestedById === actor.userId) {
    throw new InvalidStateError("errors.approval.selfDecision");
  }

  const status: ApprovalStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  // Conditional update: of two concurrent deciders exactly one matches PENDING.
  const { count } = await tx.approvalRequest.updateMany({
    where: { id: request.id, status: "PENDING", requestedById: { not: actor.userId } },
    data: { status, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason },
  });
  if (count !== 1) throw new InvalidStateError("errors.approval.notPending");

  await tx.approvalAction.create({
    data: { requestId: request.id, action: status, actorType: "USER", actorUserId: actor.userId, reason },
  });
  await recordAudit(tx, ctx, {
    action: decision === "APPROVE" ? "approvals.request.approve" : "approvals.request.reject",
    entityType: "approval_request",
    entityId: request.id,
    summary: `${request.subjectType} ${request.subjectId}: ${request.summary}`,
    before: { status: request.status },
    after: { status },
    reason,
  });
  return {
    id: request.id,
    subjectType: request.subjectType as ApprovalSubjectType,
    subjectId: request.subjectId,
    status,
  };
}

/**
 * Withdraw a pending request. Only its requester may, or a system actor when
 * the owning module voids the subject.
 */
export async function cancelApprovalRequest(
  tx: Tx,
  ctx: ServiceContext,
  rawId: unknown,
  input: unknown = {},
): Promise<DecidedApproval> {
  const { reason } = parseInput(approvalCancelSchema, input);
  const request = await loadRequest(tx, rawId);
  const actor = ctx.actor;
  if (actor.kind === "user") {
    if (!isStaffActor(actor) || request.requestedById !== actor.userId) throw new ForbiddenError();
  }
  const decidedById = actor.kind === "user" ? actor.userId : null;
  const { count } = await tx.approvalRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status: "CANCELLED", decidedById, decidedAt: new Date(), decisionReason: reason },
  });
  if (count !== 1) throw new InvalidStateError("errors.approval.notPending");

  await tx.approvalAction.create({
    data: {
      requestId: request.id,
      action: "CANCELLED",
      actorType: actor.kind === "user" ? "USER" : "SYSTEM",
      actorUserId: decidedById,
      reason,
    },
  });
  await recordAudit(tx, ctx, {
    action: "approvals.request.cancel",
    entityType: "approval_request",
    entityId: request.id,
    summary: `${request.subjectType} ${request.subjectId}: ${request.summary}`,
    before: { status: request.status },
    after: { status: "CANCELLED" },
    reason,
  });
  return {
    id: request.id,
    subjectType: request.subjectType as ApprovalSubjectType,
    subjectId: request.subjectId,
    status: "CANCELLED",
  };
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Requests the actor may see: their own, plus those of each subject type
 * whose approve permission they hold at a scope covering the request.
 */
function visibleRequestsWhere(ctx: ServiceContext): Prisma.ApprovalRequestWhereInput {
  const actor = ctx.actor;
  if (actor.kind === "system") return {};
  if (!isStaffActor(actor)) return { id: { in: [] } };
  const visible: Prisma.ApprovalRequestWhereInput[] = [{ requestedById: actor.userId }];
  for (const subjectType of APPROVAL_SUBJECT_TYPES) {
    const filter = scopeFilterFor(actor, APPROVAL_SUBJECTS[subjectType].approvePermission);
    if (filter.all) {
      visible.push({ subjectType });
    } else if (!scopeFilterIsEmpty(filter)) {
      visible.push({
        subjectType,
        OR: [
          { countryCode: { in: filter.countryCodes } },
          { legalEntityId: { in: filter.legalEntityIds } },
          { storeId: { in: filter.storeIds } },
          { warehouseId: { in: filter.warehouseIds } },
        ],
      });
    }
  }
  return { OR: visible };
}

const requestListSelect = {
  id: true,
  subjectType: true,
  subjectId: true,
  status: true,
  countryCode: true,
  legalEntityId: true,
  storeId: true,
  warehouseId: true,
  summary: true,
  requestReason: true,
  requestedAt: true,
  decidedAt: true,
  decisionReason: true,
  requestedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalRequestSelect;

export async function listApprovalRequests(
  ctx: ServiceContext,
  options: { status?: ApprovalStatus; subjectType?: string; take?: number } = {},
) {
  if (!isStaffActor(ctx.actor) && ctx.actor.kind !== "system") throw new ForbiddenError();
  const where: Prisma.ApprovalRequestWhereInput = { AND: [visibleRequestsWhere(ctx)] };
  if (options.status) where.status = options.status;
  if (options.subjectType) where.subjectType = options.subjectType;
  return db.approvalRequest.findMany({
    where,
    select: requestListSelect,
    orderBy: { requestedAt: "desc" },
    take: Math.min(Math.max(options.take ?? 50, 1), 200),
  });
}

/** One request with its history. Requests outside the actor's view are "not found". */
export async function getApprovalRequest(ctx: ServiceContext, rawId: unknown) {
  if (!isStaffActor(ctx.actor) && ctx.actor.kind !== "system") throw new ForbiddenError();
  if (!isUuid(rawId)) throw new NotFoundError("approval_request");
  const request = await db.approvalRequest.findFirst({
    where: { AND: [{ id: rawId.toLowerCase() }, visibleRequestsWhere(ctx)] },
    select: {
      ...requestListSelect,
      snapshot: true,
      actions: {
        orderBy: { occurredAt: "asc" },
        select: {
          action: true,
          actorType: true,
          reason: true,
          occurredAt: true,
          actorUser: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!request) throw new NotFoundError("approval_request");
  return request;
}

/** Can this actor decide the request? For showing or hiding decision controls only. */
export function canDecideApproval(
  ctx: ServiceContext,
  request: { subjectType: string; status: ApprovalStatus; requestedBy: { id: string } } & ApprovalScopeColumns,
): boolean {
  const actor = ctx.actor;
  if (!isStaffActor(actor) || request.status !== "PENDING") return false;
  if (request.requestedBy.id === actor.userId || !isApprovalSubjectType(request.subjectType)) return false;
  return can(actor, APPROVAL_SUBJECTS[request.subjectType].approvePermission, approvalTarget(request));
}
