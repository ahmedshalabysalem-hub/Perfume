import { describe, expect, it } from "vitest";
import { buildActor, type ActorUserRow, type UserActor } from "@/server/rbac/actor";
import { assertCan, can, scopeFilterFor } from "@/server/rbac/authorize";
import { PERMISSION_KEYS, PERMISSIONS } from "@/server/rbac/permissions";
import { SYSTEM_ROLES } from "@/server/rbac/roles";
import { scopeCovers, scopeFilterFromScopes, scopeKey } from "@/server/rbac/scope";
import { ForbiddenError } from "@/server/errors";

const STORE_RIYADH = "0190a000-0000-7000-8000-000000000001";
const STORE_CAIRO = "0190a000-0000-7000-8000-000000000002";
const ENTITY_SA = "0190a000-0000-7000-8000-000000000003";

function assignment(
  scope: Partial<ActorUserRow["roleAssignments"][number]> & {
    scopeType: ActorUserRow["roleAssignments"][number]["scopeType"];
  },
  permissions: string[],
  roleKey = "test_role",
  isActive = true,
): ActorUserRow["roleAssignments"][number] {
  return {
    countryCode: null,
    legalEntityId: null,
    storeId: null,
    warehouseId: null,
    ...scope,
    role: { key: roleKey, isActive, permissions: permissions.map((permissionKey) => ({ permissionKey })) },
  };
}

function actor(assignments: ActorUserRow["roleAssignments"], overrides: Partial<ActorUserRow> = {}): UserActor | null {
  return buildActor({
    id: "0190a000-0000-7000-8000-0000000000aa",
    email: "staff@example.test",
    name: "Staff",
    type: "STAFF",
    status: "ACTIVE",
    mustChangePassword: false,
    roleAssignments: assignments,
    ...overrides,
  });
}

describe("scope coverage", () => {
  it("GLOBAL covers every target", () => {
    expect(scopeCovers({ type: "GLOBAL" }, "global")).toBe(true);
    expect(scopeCovers({ type: "GLOBAL" }, { countryCode: "EG" })).toBe(true);
  });

  it("COUNTRY covers records in that country only", () => {
    const sa = { type: "COUNTRY", countryCode: "SA" } as const;
    expect(scopeCovers(sa, { countryCode: "SA" })).toBe(true);
    expect(scopeCovers(sa, { countryCode: "SA", storeId: STORE_RIYADH, legalEntityId: ENTITY_SA })).toBe(true);
    expect(scopeCovers(sa, { countryCode: "EG" })).toBe(false);
    expect(scopeCovers(sa, "global")).toBe(false);
    expect(scopeCovers(sa, "any")).toBe(true);
  });

  it("STORE scope does not reach country-level records", () => {
    const store = { type: "STORE", storeId: STORE_RIYADH } as const;
    expect(scopeCovers(store, { countryCode: "SA", storeId: STORE_RIYADH })).toBe(true);
    expect(scopeCovers(store, { countryCode: "SA", storeId: STORE_CAIRO })).toBe(false);
    expect(scopeCovers(store, { countryCode: "SA" })).toBe(false);
  });

  it("produces canonical scope keys", () => {
    expect(scopeKey({ type: "GLOBAL" })).toBe("GLOBAL");
    expect(scopeKey({ type: "COUNTRY", countryCode: "EG" })).toBe("COUNTRY:EG");
    expect(scopeKey({ type: "STORE", storeId: STORE_RIYADH })).toBe(`STORE:${STORE_RIYADH}`);
  });

  it("builds list filters from scopes", () => {
    expect(scopeFilterFromScopes([{ type: "COUNTRY", countryCode: "SA" }, { type: "GLOBAL" }])).toEqual({ all: true });
    expect(
      scopeFilterFromScopes([
        { type: "COUNTRY", countryCode: "SA" },
        { type: "STORE", storeId: STORE_CAIRO },
      ]),
    ).toEqual({ all: false, countryCodes: ["SA"], legalEntityIds: [], storeIds: [STORE_CAIRO], warehouseIds: [] });
  });
});

describe("can / assertCan", () => {
  it("global catalogue writes require a GLOBAL grant", () => {
    const countryManager = actor([
      assignment({ scopeType: "COUNTRY", countryCode: "SA" }, ["products.update", "products.view"]),
    ]);
    expect(can(countryManager, "products.view", "any")).toBe(true);
    expect(can(countryManager, "products.update", "global")).toBe(false);
    const globalEditor = actor([assignment({ scopeType: "GLOBAL" }, ["products.update"])]);
    expect(can(globalEditor, "products.update", "global")).toBe(true);
  });

  it("country-scoped price permission is limited to that market", () => {
    const pricer = actor([assignment({ scopeType: "COUNTRY", countryCode: "SA" }, ["products.prices.update"])]);
    expect(can(pricer, "products.prices.update", { countryCode: "SA" })).toBe(true);
    expect(can(pricer, "products.prices.update", { countryCode: "EG" })).toBe(false);
  });

  it("denies when the permission is missing", () => {
    const cashier = actor([assignment({ scopeType: "STORE", storeId: STORE_RIYADH }, ["pos.sell", "products.view"])]);
    expect(can(cashier, "products.create", "global")).toBe(false);
    expect(() => assertCan(cashier, "products.create", "global")).toThrow(ForbiddenError);
  });

  it("denies customers even if they somehow hold grants", () => {
    const customer = actor([assignment({ scopeType: "GLOBAL" }, ["products.create"])], { type: "CUSTOMER" });
    expect(can(customer, "products.create", "global")).toBe(false);
  });

  it("gives no actor to inactive users and ignores inactive roles", () => {
    expect(actor([assignment({ scopeType: "GLOBAL" }, ["admin.access"])], { status: "DEACTIVATED" })).toBeNull();
    const withDisabledRole = actor([assignment({ scopeType: "GLOBAL" }, ["admin.access"], "disabled", false)]);
    expect(can(withDisabledRole, "admin.access")).toBe(false);
  });

  it("ignores unknown permission keys stored in the database", () => {
    const weird = actor([assignment({ scopeType: "GLOBAL" }, ["root.everything"])]);
    expect(weird?.grants.size).toBe(0);
  });

  it("returns an empty filter when the permission is not held", () => {
    const viewer = actor([assignment({ scopeType: "GLOBAL" }, ["products.view"])]);
    expect(scopeFilterFor(viewer!, "organization.view")).toEqual({
      all: false,
      countryCodes: [],
      legalEntityIds: [],
      storeIds: [],
      warehouseIds: [],
    });
  });

  it("trusts system actors only", () => {
    expect(can({ kind: "system", label: "seed" }, "users.manage", "global")).toBe(true);
    expect(can(null, "admin.access")).toBe(false);
  });
});

describe("role catalogue", () => {
  it("only references defined permission keys", () => {
    const known = new Set(PERMISSION_KEYS);
    for (const role of SYSTEM_ROLES) {
      for (const permission of role.permissions) expect(known.has(permission)).toBe(true);
      expect(role.scopes.length).toBeGreaterThan(0);
    }
  });

  it("has unique permission keys with both translations", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const permission of PERMISSIONS) {
      expect(permission.en.length).toBeGreaterThan(0);
      expect(permission.ar.length).toBeGreaterThan(0);
    }
  });

  it("grants super admin every permission and customers none", () => {
    const superAdmin = SYSTEM_ROLES.find((role) => role.key === "super_admin");
    const customer = SYSTEM_ROLES.find((role) => role.key === "customer");
    expect(superAdmin?.permissions.length).toBe(PERMISSION_KEYS.length);
    expect(customer?.permissions.length).toBe(0);
  });
});
