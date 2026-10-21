import type { DbClient } from "@/server/db";
import { PERMISSIONS } from "./permissions";
import { SYSTEM_ROLES } from "./roles";

// No "server-only" import: also used by `scripts/sync-rbac.ts` and the seed.

export type RbacSyncReport = {
  permissionsUpserted: number;
  permissionsRemoved: string[];
  rolesUpserted: number;
  grantsAdded: number;
  grantsRemoved: number;
};

/**
 * Make the database match the code-defined permission catalogue and system
 * roles. Idempotent; safe to run on every deploy. Custom (non-system) roles
 * keep their grants, except for permissions that no longer exist.
 */
export async function syncRbac(client: DbClient): Promise<RbacSyncReport> {
  const report: RbacSyncReport = {
    permissionsUpserted: 0,
    permissionsRemoved: [],
    rolesUpserted: 0,
    grantsAdded: 0,
    grantsRemoved: 0,
  };

  for (const permission of PERMISSIONS) {
    await client.permission.upsert({
      where: { key: permission.key },
      update: {
        module: permission.module,
        descriptionEn: permission.en,
        descriptionAr: permission.ar,
        isSensitive: permission.sensitive ?? false,
      },
      create: {
        key: permission.key,
        module: permission.module,
        descriptionEn: permission.en,
        descriptionAr: permission.ar,
        isSensitive: permission.sensitive ?? false,
      },
    });
    report.permissionsUpserted += 1;
  }

  const definedKeys = PERMISSIONS.map((permission) => permission.key);
  const obsolete = await client.permission.findMany({
    where: { key: { notIn: definedKeys } },
    select: { key: true },
  });
  if (obsolete.length > 0) {
    report.permissionsRemoved = obsolete.map((permission) => permission.key);
    // role_permissions rows cascade.
    await client.permission.deleteMany({ where: { key: { in: report.permissionsRemoved } } });
  }

  for (const definition of SYSTEM_ROLES) {
    const role = await client.role.upsert({
      where: { key: definition.key },
      update: {
        nameEn: definition.en,
        nameAr: definition.ar,
        descriptionEn: definition.descriptionEn,
        descriptionAr: definition.descriptionAr,
        isSystem: true,
        allowedScopeTypes: definition.scopes,
      },
      create: {
        key: definition.key,
        nameEn: definition.en,
        nameAr: definition.ar,
        descriptionEn: definition.descriptionEn,
        descriptionAr: definition.descriptionAr,
        isSystem: true,
        allowedScopeTypes: definition.scopes,
      },
    });
    report.rolesUpserted += 1;

    const wanted = new Set<string>(definition.permissions);
    const current = await client.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionKey: true },
    });
    const currentKeys = new Set(current.map((grant) => grant.permissionKey));

    const toAdd = [...wanted].filter((key) => !currentKeys.has(key));
    const toRemove = [...currentKeys].filter((key) => !wanted.has(key));
    if (toAdd.length > 0) {
      await client.rolePermission.createMany({
        data: toAdd.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        skipDuplicates: true,
      });
      report.grantsAdded += toAdd.length;
    }
    if (toRemove.length > 0) {
      await client.rolePermission.deleteMany({
        where: { roleId: role.id, permissionKey: { in: toRemove } },
      });
      report.grantsRemoved += toRemove.length;
    }
  }

  return report;
}
