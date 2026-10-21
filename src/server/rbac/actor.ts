import type { ScopeType, UserStatus, UserType } from "@/generated/prisma/enums";
import { isPermissionKey, type PermissionKey } from "./permissions";
import { assignmentScopeFromRow, type AssignmentScope } from "./scope";

/** An authenticated user with resolved permissions. Built per request. */
export type UserActor = {
  kind: "user";
  userId: string;
  email: string;
  name: string;
  type: UserType;
  status: UserStatus;
  mustChangePassword: boolean;
  roleKeys: string[];
  /** permission → scopes at which the actor holds it */
  grants: ReadonlyMap<PermissionKey, readonly AssignmentScope[]>;
};

/** Non-human actor (seed, scheduled jobs). Never used for request handling. */
export type SystemActor = { kind: "system"; label: string };

export type Actor = UserActor | SystemActor;

export type ActorUserRow = {
  id: string;
  email: string;
  name: string;
  type: UserType;
  status: UserStatus;
  mustChangePassword: boolean;
  roleAssignments: Array<{
    scopeType: ScopeType;
    countryCode: string | null;
    legalEntityId: string | null;
    storeId: string | null;
    warehouseId: string | null;
    role: { key: string; isActive: boolean; permissions: Array<{ permissionKey: string }> };
  }>;
};

/**
 * Build an actor from a user row. Inactive users get no actor at all; inactive
 * roles contribute no permissions; unknown permission keys are ignored.
 */
export function buildActor(row: ActorUserRow): UserActor | null {
  if (row.status !== "ACTIVE") return null;
  const grants = new Map<PermissionKey, AssignmentScope[]>();
  const roleKeys = new Set<string>();
  for (const assignment of row.roleAssignments) {
    if (!assignment.role.isActive) continue;
    roleKeys.add(assignment.role.key);
    const scope = assignmentScopeFromRow(assignment);
    for (const { permissionKey } of assignment.role.permissions) {
      if (!isPermissionKey(permissionKey)) continue;
      const scopes = grants.get(permissionKey) ?? [];
      scopes.push(scope);
      grants.set(permissionKey, scopes);
    }
  }
  return {
    kind: "user",
    userId: row.id,
    email: row.email,
    name: row.name,
    type: row.type,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    roleKeys: [...roleKeys],
    grants,
  };
}

/** Prisma `select` matching ActorUserRow. */
export const actorUserSelect = {
  id: true,
  email: true,
  name: true,
  type: true,
  status: true,
  mustChangePassword: true,
  roleAssignments: {
    select: {
      scopeType: true,
      countryCode: true,
      legalEntityId: true,
      storeId: true,
      warehouseId: true,
      role: {
        select: { key: true, isActive: true, permissions: { select: { permissionKey: true } } },
      },
    },
  },
} as const;
