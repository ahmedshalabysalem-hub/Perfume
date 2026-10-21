import "server-only";
import { createStaffUserSchema, resetPasswordSchema, roleAssignmentSchema, updateStaffUserSchema } from "@/lib/schemas/access";
import { z } from "@/lib/validation/zod";
import { recordAudit } from "@/server/audit/audit";
import { checkPasswordPolicy, revokeAllSessions, setCredentialPassword } from "@/server/auth/credentials";
import type { ServiceContext } from "@/server/context";
import { db, type DbClient, type Prisma, type Tx } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan, can } from "@/server/rbac/authorize";
import { isPermissionKey } from "@/server/rbac/permissions";
import { SUPER_ADMIN_ROLE_KEY } from "@/server/rbac/roles";
import { scopeKey, type AssignmentScope, type AuthorizationTarget } from "@/server/rbac/scope";
import { parseInput } from "@/server/validation";

/**
 * Staff user administration. Account-level operations (create, rename,
 * reset password, change status) require `users.manage` at GLOBAL scope
 * because an account spans every scope. Role assignments are scope-aware:
 * the actor must hold `users.manage` covering the assignment's scope AND
 * every permission of the role there ("you cannot grant what you do not hold").
 */

export async function listStaffUsers(ctx: ServiceContext, options: { q?: string; status?: string } = {}) {
  assertCan(ctx.actor, "users.view");
  const q = options.q?.trim();
  const status = z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional().catch(undefined).parse(options.status);
  return db.user.findMany({
    where: {
      type: "STAFF",
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }] } : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      mustChangePassword: true,
      roleAssignments: { select: { scopeType: true, role: { select: { key: true, nameEn: true, nameAr: true } } } },
    },
  });
}

export async function getStaffUser(ctx: ServiceContext, id: string) {
  assertCan(ctx.actor, "users.view");
  const user = await db.user.findFirst({
    where: { id, type: "STAFF" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      mustChangePassword: true,
      createdAt: true,
      deactivatedAt: true,
      roleAssignments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          scopeType: true,
          scopeKey: true,
          countryCode: true,
          legalEntityId: true,
          storeId: true,
          warehouseId: true,
          createdAt: true,
          role: { select: { id: true, key: true, nameEn: true, nameAr: true } },
          country: { select: { nameEn: true, nameAr: true } },
          legalEntity: { select: { code: true, legalNameEn: true, legalNameAr: true } },
          store: { select: { code: true, nameEn: true, nameAr: true } },
          warehouse: { select: { code: true, nameEn: true, nameAr: true } },
        },
      },
    },
  });
  if (!user) throw new NotFoundError("user");
  return user;
}

/** Roles and scope targets available in the assignment form. */
export async function getAssignmentOptions(ctx: ServiceContext) {
  assertCan(ctx.actor, "users.view");
  const [roles, countries, legalEntities, stores, warehouses] = await Promise.all([
    db.role.findMany({ where: { isActive: true }, orderBy: { nameEn: "asc" }, select: { id: true, key: true, nameEn: true, nameAr: true, allowedScopeTypes: true } }),
    db.country.findMany({ orderBy: { code: "desc" }, select: { code: true, nameEn: true, nameAr: true } }),
    db.legalEntity.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, legalNameEn: true, legalNameAr: true } }),
    db.store.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, nameEn: true, nameAr: true } }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, nameEn: true, nameAr: true } }),
  ]);
  return { roles: roles.filter((role) => role.key !== "customer"), countries, legalEntities, stores, warehouses };
}

// ─── Assignment helpers ──────────────────────────────────────────────────────

type ParsedAssignment = ReturnType<typeof roleAssignmentSchema.parse>;

/** Resolve the assignment scope against the database (existence + hierarchy). */
async function resolveAssignment(client: DbClient, input: ParsedAssignment): Promise<{
  scope: AssignmentScope;
  target: AuthorizationTarget;
  columns: Pick<Prisma.UserRoleUncheckedCreateInput, "scopeType" | "scopeKey" | "countryCode" | "legalEntityId" | "storeId" | "warehouseId">;
}> {
  const none = { countryCode: null, legalEntityId: null, storeId: null, warehouseId: null };
  switch (input.scopeType) {
    case "GLOBAL": {
      const scope: AssignmentScope = { type: "GLOBAL" };
      return { scope, target: "global", columns: { scopeType: "GLOBAL", scopeKey: scopeKey(scope), ...none } };
    }
    case "COUNTRY": {
      const country = await client.country.findUnique({ where: { code: input.countryCode ?? "" } });
      if (!country) throw new ValidationError({ countryCode: ["validation.invalidReference"] });
      const scope: AssignmentScope = { type: "COUNTRY", countryCode: country.code };
      return { scope, target: { countryCode: country.code }, columns: { scopeType: "COUNTRY", scopeKey: scopeKey(scope), ...none, countryCode: country.code } };
    }
    case "LEGAL_ENTITY": {
      const entity = await client.legalEntity.findUnique({ where: { id: input.legalEntityId ?? "" } });
      if (!entity) throw new ValidationError({ legalEntityId: ["validation.invalidReference"] });
      const scope: AssignmentScope = { type: "LEGAL_ENTITY", legalEntityId: entity.id };
      return {
        scope,
        target: { countryCode: entity.countryCode, legalEntityId: entity.id },
        columns: { scopeType: "LEGAL_ENTITY", scopeKey: scopeKey(scope), ...none, legalEntityId: entity.id },
      };
    }
    case "STORE": {
      const store = await client.store.findUnique({ where: { id: input.storeId ?? "" } });
      if (!store) throw new ValidationError({ storeId: ["validation.invalidReference"] });
      const scope: AssignmentScope = { type: "STORE", storeId: store.id };
      return {
        scope,
        target: { countryCode: store.countryCode, legalEntityId: store.legalEntityId, storeId: store.id },
        columns: { scopeType: "STORE", scopeKey: scopeKey(scope), ...none, storeId: store.id },
      };
    }
    case "WAREHOUSE": {
      const warehouse = await client.warehouse.findUnique({ where: { id: input.warehouseId ?? "" } });
      if (!warehouse) throw new ValidationError({ warehouseId: ["validation.invalidReference"] });
      const scope: AssignmentScope = { type: "WAREHOUSE", warehouseId: warehouse.id };
      return {
        scope,
        target: { countryCode: warehouse.countryCode, legalEntityId: warehouse.legalEntityId, warehouseId: warehouse.id },
        columns: { scopeType: "WAREHOUSE", scopeKey: scopeKey(scope), ...none, warehouseId: warehouse.id },
      };
    }
  }
}

/** Validate an assignment request and insert it (inside the caller's transaction). */
async function insertAssignment(tx: Tx, ctx: ServiceContext, userId: string, input: ParsedAssignment) {
  const role = await tx.role.findUnique({ where: { id: input.roleId }, include: { permissions: { select: { permissionKey: true } } } });
  if (!role || !role.isActive) throw new ValidationError({ roleId: ["validation.invalidReference"] });
  if (!role.allowedScopeTypes.includes(input.scopeType)) throw new InvalidStateError("errors.invalidState.scopeNotAllowed");
  const { target, columns } = await resolveAssignment(tx, input);

  assertCan(ctx.actor, "users.manage", target);
  const escalation = role.permissions.some(({ permissionKey }) => isPermissionKey(permissionKey) && !can(ctx.actor, permissionKey, target));
  if (escalation) throw new InvalidStateError("errors.invalidState.privilegeEscalation");

  try {
    const assignment = await tx.userRole.create({
      data: { ...columns, userId, roleId: role.id, assignedById: ctx.actor.kind === "user" ? ctx.actor.userId : null },
    });
    await recordAudit(tx, ctx, {
      action: "users.role.assign",
      entityType: "user",
      entityId: userId,
      summary: `${role.key} @ ${columns.scopeKey}`,
      after: { assignmentId: assignment.id, role: role.key, scope: columns.scopeKey },
    });
    return assignment;
  } catch (error) {
    if (isUniqueViolationOn(error, "scope_key") || isUniqueViolationOn(error, "scopeKey")) {
      throw new ConflictError("errors.conflict.assignment");
    }
    throw error;
  }
}

async function activeSuperAdminCount(client: DbClient, excludingUserId?: string): Promise<number> {
  return client.user.count({
    where: {
      status: "ACTIVE",
      type: "STAFF",
      ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
      roleAssignments: { some: { scopeType: "GLOBAL", role: { key: SUPER_ADMIN_ROLE_KEY, isActive: true } } },
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createStaffUser(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, "users.manage", "global");
  const data = parseInput(createStaffUserSchema, input);
  const policy = checkPasswordPolicy(data.temporaryPassword, { email: data.email, name: data.name });
  if (policy.length > 0) throw new ValidationError({ temporaryPassword: policy });
  if (await db.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    throw new ConflictError("errors.conflict.email", { email: ["errors.conflict.email"] });
  }
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email, name: data.name, type: "STAFF", status: "ACTIVE", mustChangePassword: true },
      });
      await setCredentialPassword(tx, user.id, data.temporaryPassword);
      await recordAudit(tx, ctx, {
        action: "users.create",
        entityType: "user",
        entityId: user.id,
        summary: user.email,
        after: { email: user.email, name: user.name, type: user.type },
      });
      if (data.assignment) await insertAssignment(tx, ctx, user.id, data.assignment);
      return { id: user.id };
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "email")) throw new ConflictError("errors.conflict.email", { email: ["errors.conflict.email"] });
    throw error;
  }
}

export async function updateStaffUser(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "users.manage", "global");
  const data = parseInput(updateStaffUserSchema, input);
  const existing = await db.user.findFirst({ where: { id, type: "STAFF" } });
  if (!existing) throw new NotFoundError("user");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { name: data.name } });
    await recordAudit(tx, ctx, { action: "users.update", entityType: "user", entityId: id, before: { name: existing.name }, after: { name: data.name } });
  });
}

/** Set a new temporary password; the user is signed out everywhere and must change it. */
export async function resetStaffPassword(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "users.manage", "global");
  const data = parseInput(resetPasswordSchema, input);
  const user = await db.user.findFirst({ where: { id, type: "STAFF" } });
  if (!user) throw new NotFoundError("user");
  const policy = checkPasswordPolicy(data.temporaryPassword, { email: user.email, name: user.name });
  if (policy.length > 0) throw new ValidationError({ temporaryPassword: policy });
  await db.$transaction(async (tx) => {
    await setCredentialPassword(tx, id, data.temporaryPassword);
    await tx.user.update({ where: { id }, data: { mustChangePassword: true } });
    const revoked = await revokeAllSessions(tx, id);
    await recordAudit(tx, ctx, {
      action: "users.password.reset",
      entityType: "user",
      entityId: id,
      summary: `${user.email}: temporary password set, ${revoked} session(s) revoked`,
    });
  });
}

const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]), reason: z.string().trim().max(500).nullish() });

export async function setStaffUserStatus(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "users.manage", "global");
  const data = parseInput(statusSchema, input);
  const user = await db.user.findFirst({ where: { id, type: "STAFF" } });
  if (!user) throw new NotFoundError("user");
  if (user.status === data.status) return;
  if (data.status !== "ACTIVE" && ctx.actor.kind === "user" && ctx.actor.userId === id) {
    throw new InvalidStateError("errors.invalidState.selfDeactivation");
  }
  // Serializable: two administrators cannot concurrently remove the last two Super Admins.
  await db.$transaction(async (tx) => {
    if (data.status !== "ACTIVE" && user.status === "ACTIVE") {
      const isSuperAdmin =
        (await tx.userRole.count({ where: { userId: id, scopeType: "GLOBAL", role: { key: SUPER_ADMIN_ROLE_KEY, isActive: true } } })) > 0;
      if (isSuperAdmin && (await activeSuperAdminCount(tx, id)) === 0) {
        throw new InvalidStateError("errors.invalidState.lastSuperAdmin");
      }
    }
    await tx.user.update({
      where: { id },
      data: { status: data.status, deactivatedAt: data.status === "DEACTIVATED" ? new Date() : null },
    });
    const revoked = data.status === "ACTIVE" ? 0 : await revokeAllSessions(tx, id);
    await recordAudit(tx, ctx, {
      action: "users.status",
      entityType: "user",
      entityId: id,
      summary: `${user.email}: ${user.status} → ${data.status}${revoked ? `, ${revoked} session(s) revoked` : ""}`,
      before: { status: user.status },
      after: { status: data.status },
      reason: data.reason ?? null,
    });
  }, { isolationLevel: "Serializable" });
}

export async function assignRole(ctx: ServiceContext, userId: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, "users.manage");
  const data = parseInput(roleAssignmentSchema, input);
  const user = await db.user.findFirst({ where: { id: userId, type: "STAFF" }, select: { id: true } });
  if (!user) throw new NotFoundError("user");
  return db.$transaction(async (tx) => {
    const assignment = await insertAssignment(tx, ctx, userId, data);
    return { id: assignment.id };
  });
}

export async function revokeRoleAssignment(ctx: ServiceContext, assignmentId: string): Promise<void> {
  assertCan(ctx.actor, "users.manage");
  const assignment = await db.userRole.findUnique({
    where: { id: assignmentId },
    include: { role: { select: { key: true } }, store: true, warehouse: true, legalEntity: true },
  });
  if (!assignment) throw new NotFoundError("user_role");
  const target: AuthorizationTarget =
    assignment.scopeType === "GLOBAL"
      ? "global"
      : assignment.scopeType === "COUNTRY"
        ? { countryCode: assignment.countryCode ?? undefined }
        : assignment.scopeType === "LEGAL_ENTITY"
          ? { legalEntityId: assignment.legalEntityId ?? undefined, countryCode: assignment.legalEntity?.countryCode }
          : assignment.scopeType === "STORE"
            ? { storeId: assignment.storeId ?? undefined, legalEntityId: assignment.store?.legalEntityId, countryCode: assignment.store?.countryCode }
            : { warehouseId: assignment.warehouseId ?? undefined, legalEntityId: assignment.warehouse?.legalEntityId, countryCode: assignment.warehouse?.countryCode };
  assertCan(ctx.actor, "users.manage", target);

  await db.$transaction(async (tx) => {
    if (assignment.role.key === SUPER_ADMIN_ROLE_KEY && assignment.scopeType === "GLOBAL") {
      if ((await activeSuperAdminCount(tx, assignment.userId)) === 0) throw new InvalidStateError("errors.invalidState.lastSuperAdmin");
    }
    await tx.userRole.delete({ where: { id: assignmentId } });
    await recordAudit(tx, ctx, {
      action: "users.role.revoke",
      entityType: "user",
      entityId: assignment.userId,
      summary: `${assignment.role.key} @ ${assignment.scopeKey}`,
      before: { assignmentId, role: assignment.role.key, scope: assignment.scopeKey },
    });
  }, { isolationLevel: "Serializable" });
}
