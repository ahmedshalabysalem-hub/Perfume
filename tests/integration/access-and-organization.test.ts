import { beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { db } from "@/server/db";
import { AppError, ConflictError, ForbiddenError, InvalidStateError, ValidationError } from "@/server/errors";
import {
  assignRole,
  createStaffUser,
  resetStaffPassword,
  revokeRoleAssignment,
  setStaffUserStatus,
} from "@/server/modules/access/users.service";
import { listAuditLogs } from "@/server/modules/access/access-queries.service";
import {
  createLegalEntity,
  createStore,
  listStores,
  updateCountry,
  updateStore,
} from "@/server/modules/organization/organization.service";
import { auditEntries, contextFor, reloadActor, seedFixture, TEST_PASSWORD, type Fixture } from "./fixtures";

let f: Fixture;

beforeEach(async () => {
  f = await seedFixture();
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

const roleId = async (key: string) => (await db.role.findUniqueOrThrow({ where: { key } })).id;
const userId = (ctx: Fixture["superAdmin"]) => (ctx.actor.kind === "user" ? ctx.actor.userId : "");

describe("staff user administration", () => {
  it("creates a staff user with a temporary password and an initial role, atomically", async () => {
    const { id } = await createStaffUser(f.superAdmin, {
      name: "New Cashier",
      email: "New.Cashier@Example.COM",
      temporaryPassword: "Temporary-Pass-2026",
      assignment: { roleId: await roleId("cashier"), scopeType: "STORE", storeId: f.storeId },
    });
    const user = await db.user.findUniqueOrThrow({ where: { id }, include: { accounts: true, roleAssignments: true } });
    expect(user.email).toBe("new.cashier@example.com");
    expect(user.type).toBe("STAFF");
    expect(user.mustChangePassword).toBe(true);
    expect(user.roleAssignments).toHaveLength(1);
    // The stored credential is a scrypt hash that Better Auth can verify.
    const hash = user.accounts[0]?.password ?? "";
    expect(hash).not.toContain("Temporary-Pass-2026");
    expect(await verifyPassword({ hash, password: "Temporary-Pass-2026" })).toBe(true);
    expect((await auditEntries("users.create"))[0]?.after).not.toHaveProperty("temporaryPassword");
  });

  it("rolls back the user if the initial assignment is invalid", async () => {
    const error = await errorOf(
      createStaffUser(f.superAdmin, {
        name: "Bad Scope",
        email: "bad.scope@example.com",
        temporaryPassword: "Temporary-Pass-2026",
        assignment: { roleId: await roleId("cashier"), scopeType: "GLOBAL" },
      }),
    );
    expect(error.messageKey).toBe("errors.invalidState.scopeNotAllowed");
    expect(await db.user.count({ where: { email: "bad.scope@example.com" } })).toBe(0);
  });

  it("enforces the password policy and unique e-mails", async () => {
    const weak = await errorOf(createStaffUser(f.superAdmin, { name: "Weak", email: "weak@example.com", temporaryPassword: "short" }));
    expect(weak).toBeInstanceOf(ValidationError);
    expect(weak.fieldErrors?.temporaryPassword?.[0]).toMatch(/^validation\.passwordTooShort/);
    const duplicate = await errorOf(
      createStaffUser(f.superAdmin, { name: "Dup", email: "CATALOG@test.local", temporaryPassword: "Another-Long-Pass-1" }),
    );
    expect(duplicate).toBeInstanceOf(ConflictError);
  });

  it("requires GLOBAL users.manage for account operations", async () => {
    expect(await errorOf(createStaffUser(f.catalogManager, { name: "X", email: "x@example.com", temporaryPassword: "Long-Enough-Pass-1" }))).toBeInstanceOf(
      ForbiddenError,
    );
    expect(await errorOf(setStaffUserStatus(f.saManager, userId(f.cashier), { status: "DEACTIVATED" }))).toBeInstanceOf(ForbiddenError);
  });
});

describe("role assignments", () => {
  it("validates that the role may be assigned at the requested scope", async () => {
    const error = await errorOf(assignRole(f.superAdmin, userId(f.viewer), { roleId: await roleId("warehouse_staff"), scopeType: "COUNTRY", countryCode: "SA" }));
    expect(error.messageKey).toBe("errors.invalidState.scopeNotAllowed");
  });

  it("rejects duplicate assignments", async () => {
    const input = { roleId: await roleId("sales_staff"), scopeType: "COUNTRY", countryCode: "EG" } as const;
    await assignRole(f.superAdmin, userId(f.viewer), input);
    expect(await errorOf(assignRole(f.superAdmin, userId(f.viewer), input))).toBeInstanceOf(ConflictError);
  });

  it("prevents privilege escalation: you cannot grant permissions you do not hold", async () => {
    // A user administrator scoped to SA who is not a catalogue editor.
    const admin = await db.user.create({ data: { email: "useradmin@test.local", name: "User Admin", type: "STAFF" } });
    const userAdminRole = await db.role.create({
      data: { key: "user_admin_test", nameEn: "User admin", nameAr: "مدير مستخدمين", allowedScopeTypes: ["GLOBAL", "COUNTRY"] },
    });
    await db.rolePermission.createMany({
      data: ["admin.access", "users.view", "users.manage"].map((permissionKey) => ({ roleId: userAdminRole.id, permissionKey })),
    });
    await db.userRole.create({ data: { userId: admin.id, roleId: userAdminRole.id, scopeType: "COUNTRY", scopeKey: "COUNTRY:SA", countryCode: "SA" } });
    const ctx = contextFor((await reloadActor(admin.id))!);

    const escalation = await errorOf(assignRole(ctx, userId(f.viewer), { roleId: await roleId("catalog_manager"), scopeType: "COUNTRY", countryCode: "SA" }));
    expect(escalation.messageKey).toBe("errors.invalidState.privilegeEscalation");
    // Outside their scope entirely: forbidden.
    expect(
      await errorOf(assignRole(ctx, userId(f.viewer), { roleId: userAdminRole.id, scopeType: "COUNTRY", countryCode: "EG" })),
    ).toBeInstanceOf(ForbiddenError);
    // Within scope and holding every permission of the role: allowed.
    await assignRole(ctx, userId(f.viewer), { roleId: userAdminRole.id, scopeType: "COUNTRY", countryCode: "SA" });
  });

  it("applies revocations immediately to the actor's permissions", async () => {
    const before = await reloadActor(userId(f.catalogManager));
    expect(before?.grants.has("products.create")).toBe(true);
    const assignment = await db.userRole.findFirstOrThrow({ where: { userId: userId(f.catalogManager) } });
    await revokeRoleAssignment(f.superAdmin, assignment.id);
    const after = await reloadActor(userId(f.catalogManager));
    expect(after?.grants.has("products.create")).toBe(false);
    expect(await auditEntries("users.role.revoke")).toHaveLength(1);
  });

  it("never removes the last active Super Admin", async () => {
    const assignment = await db.userRole.findFirstOrThrow({ where: { userId: userId(f.superAdmin) } });
    const error = await errorOf(revokeRoleAssignment(f.superAdmin, assignment.id));
    expect(error.messageKey).toBe("errors.invalidState.lastSuperAdmin");
  });
});

describe("account status and sessions", () => {
  it("deactivation revokes sessions immediately and the account gets no actor", async () => {
    const cashierId = userId(f.cashier);
    await db.session.create({ data: { userId: cashierId, token: "session-token-1", expiresAt: new Date(Date.now() + 3_600_000) } });
    await setStaffUserStatus(f.superAdmin, cashierId, { status: "DEACTIVATED", reason: "Left the company" });
    expect(await db.session.count({ where: { userId: cashierId } })).toBe(0);
    expect(await reloadActor(cashierId)).toBeNull();
    const [audit] = await auditEntries("users.status");
    expect(audit?.reason).toBe("Left the company");
  });

  it("refuses self-deactivation", async () => {
    const error = await errorOf(setStaffUserStatus(f.superAdmin, userId(f.superAdmin), { status: "SUSPENDED" }));
    expect(error).toBeInstanceOf(InvalidStateError);
  });

  it("password reset replaces the hash, forces a change and signs the user out", async () => {
    const viewerId = userId(f.viewer);
    await db.session.create({ data: { userId: viewerId, token: "session-token-2", expiresAt: new Date(Date.now() + 3_600_000) } });
    await resetStaffPassword(f.superAdmin, viewerId, { temporaryPassword: "Brand-New-Temp-Pass-7" });
    const account = await db.account.findFirstOrThrow({ where: { userId: viewerId, providerId: "credential" } });
    expect(await verifyPassword({ hash: account.password!, password: "Brand-New-Temp-Pass-7" })).toBe(true);
    expect(await verifyPassword({ hash: account.password!, password: TEST_PASSWORD })).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: viewerId } })).mustChangePassword).toBe(true);
    expect(await db.session.count({ where: { userId: viewerId } })).toBe(0);
  });
});

describe("organisation scoping", () => {
  it("lists only stores inside the actor's scope", async () => {
    const egEntity = await createLegalEntity(f.superAdmin, { code: "TEST-EG", countryCode: "EG", legalNameEn: "Egypt Co", legalNameAr: "شركة مصر" });
    await createStore(f.superAdmin, { code: "EG-STORE", legalEntityId: egEntity.id, type: "ONLINE", nameEn: "EG", nameAr: "مصر", timezone: "Africa/Cairo" });
    const all = await listStores(f.superAdmin);
    const saOnly = await listStores(f.saManager);
    expect(all.map((store) => store.code).sort()).toEqual(["EG-STORE", "SA-STORE-1"]);
    expect(saOnly.map((store) => store.code)).toEqual(["SA-STORE-1"]);
  });

  it("derives a store's country and currency from its legal entity", async () => {
    const egEntity = await createLegalEntity(f.superAdmin, { code: "TEST-EG2", countryCode: "EG", legalNameEn: "Egypt Co", legalNameAr: "شركة مصر" });
    const { id } = await createStore(f.superAdmin, {
      code: "EG-2",
      legalEntityId: egEntity.id,
      type: "RETAIL",
      nameEn: "Cairo",
      nameAr: "القاهرة",
      timezone: "Africa/Cairo",
      // Attempts to smuggle a different country/currency are ignored by the schema.
      countryCode: "SA",
      currencyCode: "SAR",
    });
    expect(await db.store.findUniqueOrThrow({ where: { id } })).toMatchObject({ countryCode: "EG", currencyCode: "EGP" });
  });

  it("validates KSA VAT number format on legal entities", async () => {
    const error = await errorOf(
      createLegalEntity(f.superAdmin, { code: "BAD-VAT", countryCode: "SA", legalNameEn: "X", legalNameAr: "س", taxRegistrationNo: "12345" }),
    );
    expect(error.fieldErrors?.taxRegistrationNo).toEqual(["validation.invalidFormat"]);
    await createLegalEntity(f.superAdmin, { code: "GOOD-VAT", countryCode: "SA", legalNameEn: "X", legalNameAr: "س", taxRegistrationNo: "300000000000003" });
  });

  it("market settings need GLOBAL organisation.manage", async () => {
    const input = { nameEn: "Saudi Arabia", nameAr: "السعودية", timezone: "Asia/Riyadh", defaultLocale: "ar", pricesIncludeTax: false, isActive: true };
    expect(await errorOf(updateCountry(f.saManager, "SA", input))).toBeInstanceOf(ForbiddenError);
    const invalid = await errorOf(updateCountry(f.superAdmin, "SA", { ...input, timezone: "Mars/Olympus" }));
    expect(invalid.fieldErrors?.timezone).toEqual(["validation.timezone"]);
    await updateCountry(f.superAdmin, "SA", input);
    expect((await db.country.findUniqueOrThrow({ where: { code: "SA" } })).pricesIncludeTax).toBe(false);
  });

  it("a store's legal entity cannot be changed after creation", async () => {
    await updateStore(f.superAdmin, f.storeId, {
      code: "SA-STORE-1",
      legalEntityId: "00000000-0000-7000-8000-000000000000",
      type: "RETAIL",
      nameEn: "Renamed",
      nameAr: "متجر",
      timezone: "Asia/Riyadh",
    });
    const store = await db.store.findUniqueOrThrow({ where: { id: f.storeId } });
    expect(store.legalEntityId).toBe(f.legalEntitySaId);
    expect(store.nameEn).toBe("Renamed");
  });
});

describe("audit log access", () => {
  it("requires GLOBAL audit.view because entries are not partitioned by country", async () => {
    // business_manager holds audit.view at COUNTRY:SA only.
    expect(await errorOf(listAuditLogs(f.saManager, {}))).toBeInstanceOf(ForbiddenError);
    const result = await listAuditLogs(f.superAdmin, {});
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});
