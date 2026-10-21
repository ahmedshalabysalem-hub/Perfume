import type { ScopeType } from "@/generated/prisma/enums";

/** The scope of a single role assignment. */
export type AssignmentScope =
  | { type: "GLOBAL" }
  | { type: "COUNTRY"; countryCode: string }
  | { type: "LEGAL_ENTITY"; legalEntityId: string }
  | { type: "STORE"; storeId: string }
  | { type: "WAREHOUSE"; warehouseId: string };

/**
 * Where a record lives. Callers must resolve the full hierarchy: a store
 * resource carries its legal entity and country, a warehouse its legal entity
 * and country, a legal entity its country, a market price its country.
 */
export type ResourceScope = {
  countryCode?: string;
  legalEntityId?: string;
  storeId?: string;
  warehouseId?: string;
};

/**
 * The target of an authorisation check:
 *  - "global-write": changes to organisation-wide master data (catalogue,
 *    roles). Requires the permission at GLOBAL scope.
 *  - "any": reading organisation-wide master data. The permission held at any
 *    scope is sufficient.
 *  - a ResourceScope: a record that belongs to a country / entity / store /
 *    warehouse. Requires an assignment whose scope covers the record.
 */
export type AuthorizationTarget = "global-write" | "any" | ResourceScope;

export function scopeKey(scope: AssignmentScope): string {
  switch (scope.type) {
    case "GLOBAL":
      return "GLOBAL";
    case "COUNTRY":
      return `COUNTRY:${scope.countryCode}`;
    case "LEGAL_ENTITY":
      return `LEGAL_ENTITY:${scope.legalEntityId}`;
    case "STORE":
      return `STORE:${scope.storeId}`;
    case "WAREHOUSE":
      return `WAREHOUSE:${scope.warehouseId}`;
  }
}

/** Does an assignment at `scope` cover `target`? Pure and side-effect free. */
export function scopeCovers(scope: AssignmentScope, target: AuthorizationTarget): boolean {
  if (scope.type === "GLOBAL") return true;
  if (target === "any") return true;
  if (target === "global-write") return false;
  switch (scope.type) {
    case "COUNTRY":
      return target.countryCode !== undefined && target.countryCode === scope.countryCode;
    case "LEGAL_ENTITY":
      return target.legalEntityId !== undefined && target.legalEntityId === scope.legalEntityId;
    case "STORE":
      return target.storeId !== undefined && target.storeId === scope.storeId;
    case "WAREHOUSE":
      return target.warehouseId !== undefined && target.warehouseId === scope.warehouseId;
  }
}

/** Build an AssignmentScope from database columns (user_roles row). */
export function assignmentScopeFromRow(row: {
  scopeType: ScopeType;
  countryCode: string | null;
  legalEntityId: string | null;
  storeId: string | null;
  warehouseId: string | null;
}): AssignmentScope {
  switch (row.scopeType) {
    case "GLOBAL":
      return { type: "GLOBAL" };
    case "COUNTRY":
      if (!row.countryCode) throw new Error("COUNTRY assignment without country_code");
      return { type: "COUNTRY", countryCode: row.countryCode };
    case "LEGAL_ENTITY":
      if (!row.legalEntityId) throw new Error("LEGAL_ENTITY assignment without legal_entity_id");
      return { type: "LEGAL_ENTITY", legalEntityId: row.legalEntityId };
    case "STORE":
      if (!row.storeId) throw new Error("STORE assignment without store_id");
      return { type: "STORE", storeId: row.storeId };
    case "WAREHOUSE":
      if (!row.warehouseId) throw new Error("WAREHOUSE assignment without warehouse_id");
      return { type: "WAREHOUSE", warehouseId: row.warehouseId };
  }
}

/**
 * The set of records an actor may see for a permission, expressed as
 * allow-lists. `all: true` means unrestricted. Used to build list filters so
 * scoped users never receive rows outside their scope.
 */
export type ScopeFilter =
  | { all: true }
  | {
      all: false;
      countryCodes: string[];
      legalEntityIds: string[];
      storeIds: string[];
      warehouseIds: string[];
    };

export function scopeFilterFromScopes(scopes: readonly AssignmentScope[]): ScopeFilter {
  if (scopes.some((scope) => scope.type === "GLOBAL")) return { all: true };
  const filter = {
    all: false as const,
    countryCodes: [] as string[],
    legalEntityIds: [] as string[],
    storeIds: [] as string[],
    warehouseIds: [] as string[],
  };
  for (const scope of scopes) {
    if (scope.type === "COUNTRY") filter.countryCodes.push(scope.countryCode);
    if (scope.type === "LEGAL_ENTITY") filter.legalEntityIds.push(scope.legalEntityId);
    if (scope.type === "STORE") filter.storeIds.push(scope.storeId);
    if (scope.type === "WAREHOUSE") filter.warehouseIds.push(scope.warehouseId);
  }
  return filter;
}

/** True when the filter cannot match anything. */
export function scopeFilterIsEmpty(filter: ScopeFilter): boolean {
  return (
    !filter.all &&
    filter.countryCodes.length === 0 &&
    filter.legalEntityIds.length === 0 &&
    filter.storeIds.length === 0 &&
    filter.warehouseIds.length === 0
  );
}
