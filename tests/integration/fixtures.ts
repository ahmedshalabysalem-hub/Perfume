import { setCredentialPassword } from "@/server/auth/credentials";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { actorUserSelect, buildActor, type UserActor } from "@/server/rbac/actor";
import { syncRbac } from "@/server/rbac/sync";

const TABLES = [
  "audit_logs",
  "supplier_products",
  "supplier_contacts",
  "suppliers",
  "product_compliance",
  "product_images",
  "product_prices",
  "product_variants",
  "product_fragrance_notes",
  "product_categories",
  "products",
  "fragrance_notes",
  "fragrance_concentrations",
  "fragrance_families",
  "categories",
  "brands",
  "user_roles",
  "role_permissions",
  "roles",
  "permissions",
  "sessions",
  "accounts",
  "verifications",
  "rate_limits",
  "users",
  "warehouses",
  "stores",
  "legal_entities",
  "countries",
  "currencies",
];

/** Empty every table (audit log included, via the retention-purge switch). */
export async function resetDatabase(): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.audit_retention_purge = 'on'");
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`);
  });
}

export const TEST_PASSWORD = "Correct-Horse-Battery-9";

export type Fixture = {
  superAdmin: ServiceContext;
  catalogManager: ServiceContext;
  saManager: ServiceContext;
  cashier: ServiceContext;
  viewer: ServiceContext;
  storeId: string;
  legalEntitySaId: string;
  warehouseId: string;
};

export function contextFor(actor: UserActor): ServiceContext {
  return { actor, meta: { correlationId: `test-${crypto.randomUUID()}`, ipAddress: "127.0.0.1", userAgent: "vitest" } };
}

export async function reloadActor(userId: string): Promise<UserActor | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: actorUserSelect });
  return row ? buildActor(row) : null;
}

export async function createStaff(
  email: string,
  roleKey: string,
  scope:
    | { type: "GLOBAL" }
    | { type: "COUNTRY"; countryCode: string }
    | { type: "LEGAL_ENTITY"; legalEntityId: string }
    | { type: "STORE"; storeId: string },
  options: { type?: "STAFF" | "CUSTOMER" } = {},
): Promise<UserActor> {
  const user = await db.user.create({ data: { email, name: email.split("@")[0]!, type: options.type ?? "STAFF" } });
  await setCredentialPassword(db, user.id, TEST_PASSWORD);
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const scopeKey =
    scope.type === "GLOBAL"
      ? "GLOBAL"
      : scope.type === "COUNTRY"
        ? `COUNTRY:${scope.countryCode}`
        : scope.type === "LEGAL_ENTITY"
          ? `LEGAL_ENTITY:${scope.legalEntityId}`
          : `STORE:${scope.storeId}`;
  await db.userRole.create({
    data: {
      userId: user.id,
      roleId: role.id,
      scopeType: scope.type,
      scopeKey,
      countryCode: scope.type === "COUNTRY" ? scope.countryCode : null,
      legalEntityId: scope.type === "LEGAL_ENTITY" ? scope.legalEntityId : null,
      storeId: scope.type === "STORE" ? scope.storeId : null,
    },
  });
  const actor = await reloadActor(user.id);
  if (!actor) throw new Error("fixture actor not built");
  return actor;
}

/** Reference data + RBAC + one user per relevant role. */
export async function seedFixture(): Promise<Fixture> {
  await resetDatabase();
  await db.currency.createMany({
    data: [
      { code: "SAR", nameEn: "Saudi Riyal", nameAr: "ريال سعودي", symbolEn: "SAR", symbolAr: "ر.س", minorUnits: 2 },
      { code: "EGP", nameEn: "Egyptian Pound", nameAr: "جنيه مصري", symbolEn: "EGP", symbolAr: "ج.م", minorUnits: 2 },
    ],
  });
  await db.country.createMany({
    data: [
      {
        code: "SA",
        nameEn: "Saudi Arabia",
        nameAr: "السعودية",
        currencyCode: "SAR",
        defaultLocale: "ar",
        timezone: "Asia/Riyadh",
        phoneCode: "+966",
      },
      {
        code: "EG",
        nameEn: "Egypt",
        nameAr: "مصر",
        currencyCode: "EGP",
        defaultLocale: "ar",
        timezone: "Africa/Cairo",
        phoneCode: "+20",
      },
    ],
  });
  const entity = await db.legalEntity.create({
    data: { code: "TEST-SA", countryCode: "SA", legalNameEn: "Test Co", legalNameAr: "شركة اختبار" },
  });
  const store = await db.store.create({
    data: {
      code: "SA-STORE-1",
      legalEntityId: entity.id,
      countryCode: "SA",
      type: "RETAIL",
      nameEn: "Store",
      nameAr: "متجر",
      timezone: "Asia/Riyadh",
      currencyCode: "SAR",
    },
  });
  const warehouse = await db.warehouse.create({
    data: {
      code: "SA-WH-1",
      legalEntityId: entity.id,
      countryCode: "SA",
      nameEn: "Warehouse",
      nameAr: "مستودع",
      timezone: "Asia/Riyadh",
    },
  });
  await syncRbac(db);

  return {
    superAdmin: contextFor(await createStaff("root@test.local", "super_admin", { type: "GLOBAL" })),
    catalogManager: contextFor(await createStaff("catalog@test.local", "catalog_manager", { type: "GLOBAL" })),
    saManager: contextFor(
      await createStaff("manager.sa@test.local", "business_manager", { type: "COUNTRY", countryCode: "SA" }),
    ),
    cashier: contextFor(await createStaff("cashier@test.local", "cashier", { type: "STORE", storeId: store.id })),
    viewer: contextFor(await createStaff("support@test.local", "customer_support", { type: "GLOBAL" })),
    storeId: store.id,
    legalEntitySaId: entity.id,
    warehouseId: warehouse.id,
  };
}

export async function auditEntries(action: string) {
  return db.auditLog.findMany({ where: { action }, orderBy: { occurredAt: "asc" } });
}
