import "server-only";
import { z } from "@/lib/validation/zod";
import type { ServiceContext } from "@/server/context";
import { db, type Prisma } from "@/server/db";
import { assertCan } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

export async function listRolesWithPermissions(ctx: ServiceContext) {
  assertCan(ctx.actor, "users.view");
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { nameEn: "asc" }],
    include: {
      permissions: { select: { permissionKey: true } },
      _count: { select: { assignments: true } },
    },
  });
  return { roles, permissions: PERMISSIONS };
}

const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional().catch(undefined),
  entity: z.string().trim().max(64).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export const AUDIT_PAGE_SIZE = 50;

/**
 * The audit log is not partitioned by country or store, so reading it
 * requires `audit.view` at GLOBAL scope.
 */
export async function listAuditLogs(ctx: ServiceContext, rawQuery: unknown) {
  assertCan(ctx.actor, "audit.view", "global");
  const query = auditQuerySchema.parse(rawQuery ?? {});
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: { contains: query.action } } : {}),
    ...(query.entity ? { entityType: query.entity } : {}),
    ...(query.from || query.to
      ? {
          occurredAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };
  const total = await db.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const entries = await db.auditLog.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
  });
  const actorIds = [...new Set(entries.map((entry) => entry.actorUserId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const entityTypes = await db.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return {
    entries: entries.map((entry) => ({
      ...entry,
      actor: entry.actorUserId ? (actorMap.get(entry.actorUserId) ?? null) : null,
    })),
    total,
    page,
    pageCount,
    query: { ...query, page },
    entityTypes: entityTypes.map((row) => row.entityType),
  };
}
