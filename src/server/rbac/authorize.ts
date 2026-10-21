import { ForbiddenError } from "@/server/errors";
import type { Actor, UserActor } from "./actor";
import type { PermissionKey } from "./permissions";
import { scopeCovers, scopeFilterFromScopes, type AuthorizationTarget, type ScopeFilter } from "./scope";

/**
 * Authorisation is always decided on the server, from the actor's grants, at
 * the service layer — never by hiding UI. See docs/RBAC.md for the rules.
 */
export function can(
  actor: Actor | null | undefined,
  permission: PermissionKey,
  target: AuthorizationTarget = "any",
): boolean {
  if (!actor) return false;
  // System actors (seed, jobs) run trusted code paths only.
  if (actor.kind === "system") return true;
  if (actor.status !== "ACTIVE") return false;
  // Every back-office permission additionally requires a staff account.
  if (actor.type !== "STAFF") return false;
  const scopes = actor.grants.get(permission);
  if (!scopes || scopes.length === 0) return false;
  return scopes.some((scope) => scopeCovers(scope, target));
}

export function assertCan(
  actor: Actor | null | undefined,
  permission: PermissionKey,
  target: AuthorizationTarget = "any",
): void {
  if (!can(actor, permission, target)) {
    throw new ForbiddenError({ permission });
  }
}

/** Row-level filter for list queries of scoped records. */
export function scopeFilterFor(actor: Actor, permission: PermissionKey): ScopeFilter {
  if (actor.kind === "system") return { all: true };
  if (!can(actor, permission, "any")) {
    return { all: false, countryCodes: [], legalEntityIds: [], storeIds: [], warehouseIds: [] };
  }
  return scopeFilterFromScopes(actor.grants.get(permission) ?? []);
}

export function isStaffActor(actor: Actor | null | undefined): actor is UserActor {
  return !!actor && actor.kind === "user" && actor.type === "STAFF" && actor.status === "ACTIVE";
}
