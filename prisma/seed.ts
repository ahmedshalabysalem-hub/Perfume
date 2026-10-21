/**
 * Development seed — idempotent (safe to re-run). Creates reference data,
 * a demo organisation, RBAC roles, a Super Admin, demo staff accounts and a
 * small fictional catalogue. Refuses to run with NODE_ENV=production.
 *
 *   npm run db:seed
 */
import { randomBytes } from "node:crypto";
import { gtinCheckDigit } from "../src/lib/barcode";
import { checkPasswordPolicy, setCredentialPassword } from "../src/server/auth/credentials";
import { refreshProductSearchText } from "../src/server/modules/catalog/search-document";
import { syncRbac } from "../src/server/rbac/sync";
import { createScriptClient } from "../scripts/lib/prisma";
import {
  BRANDS,
  CATEGORIES,
  CONCENTRATIONS,
  COUNTRIES,
  CURRENCIES,
  DEMO_STAFF,
  FAMILIES,
  LEGAL_ENTITIES,
  NOTES,
  PRODUCTS,
  STORES,
  WAREHOUSES,
} from "./seed-data";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV=production. The seed creates demo accounts and data.");
  process.exit(1);
}

const prisma = createScriptClient();

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function resolveSeedPassword(): { password: string; generated: boolean } {
  const configured = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (configured) {
    const problems = checkPasswordPolicy(configured);
    if (problems.length > 0) {
      throw new Error(`SEED_ADMIN_PASSWORD does not meet the password policy: ${problems.join(", ")}`);
    }
    return { password: configured, generated: false };
  }
  return { password: randomBytes(18).toString("base64url"), generated: true };
}

async function seedOrganisation(tx: Tx) {
  for (const currency of CURRENCIES) {
    await tx.currency.upsert({ where: { code: currency.code }, update: { ...currency }, create: { ...currency } });
  }
  for (const country of COUNTRIES) {
    await tx.country.upsert({
      where: { code: country.code },
      update: { nameEn: country.nameEn, nameAr: country.nameAr, timezone: country.timezone },
      create: { ...country, pricesIncludeTax: true, isActive: true },
    });
  }
  const entities = new Map<string, { id: string; countryCode: string }>();
  for (const entity of LEGAL_ENTITIES) {
    const row = await tx.legalEntity.upsert({
      where: { code: entity.code },
      update: { legalNameEn: entity.legalNameEn, legalNameAr: entity.legalNameAr },
      create: { ...entity },
    });
    entities.set(entity.code, { id: row.id, countryCode: row.countryCode });
  }
  const stores = new Map<string, string>();
  for (const store of STORES) {
    const entity = entities.get(store.legalEntityCode)!;
    const { legalEntityCode: _legalEntityCode, ...data } = store;
    const row = await tx.store.upsert({
      where: { code: store.code },
      update: { nameEn: store.nameEn, nameAr: store.nameAr },
      create: { ...data, legalEntityId: entity.id, countryCode: entity.countryCode },
    });
    stores.set(store.code, row.id);
  }
  for (const warehouse of WAREHOUSES) {
    const entity = entities.get(warehouse.legalEntityCode)!;
    const { legalEntityCode: _legalEntityCode, ...data } = warehouse;
    await tx.warehouse.upsert({
      where: { code: warehouse.code },
      update: { nameEn: warehouse.nameEn, nameAr: warehouse.nameAr },
      create: { ...data, legalEntityId: entity.id, countryCode: entity.countryCode },
    });
  }
  return { stores };
}

async function ensureStaffUser(
  tx: Tx,
  input: { email: string; name: string; password: string; roleKey: string; scope: { type: "GLOBAL" } | { type: "COUNTRY"; countryCode: string } | { type: "STORE"; storeId: string } },
) {
  const email = input.email.toLowerCase();
  const user = await tx.user.upsert({
    where: { email },
    update: {},
    create: { email, name: input.name, type: "STAFF", status: "ACTIVE", emailVerified: true },
  });
  const existingCredential = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (!existingCredential) {
    await setCredentialPassword(tx, user.id, input.password);
  }
  const role = await tx.role.findUniqueOrThrow({ where: { key: input.roleKey } });
  const scope = input.scope;
  const scopeKey =
    scope.type === "GLOBAL" ? "GLOBAL" : scope.type === "COUNTRY" ? `COUNTRY:${scope.countryCode}` : `STORE:${scope.storeId}`;
  await tx.userRole.upsert({
    where: { userId_roleId_scopeKey: { userId: user.id, roleId: role.id, scopeKey } },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id,
      scopeType: scope.type,
      scopeKey,
      countryCode: scope.type === "COUNTRY" ? scope.countryCode : null,
      storeId: scope.type === "STORE" ? scope.storeId : null,
    },
  });
  return { user, createdCredential: !existingCredential };
}

async function seedCatalogReference(tx: Tx) {
  for (const item of CONCENTRATIONS) {
    await tx.concentration.upsert({ where: { code: item.code }, update: {}, create: { ...item } });
  }
  for (const item of FAMILIES) {
    await tx.fragranceFamily.upsert({ where: { code: item.code }, update: {}, create: { ...item } });
  }
  for (const note of NOTES) {
    await tx.fragranceNote.upsert({ where: { slug: note.slug }, update: {}, create: { ...note } });
  }
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const parentId = category.parent ? categoryIds.get(category.parent) ?? null : null;
    const row = await tx.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { slug: category.slug, parentId, nameEn: category.nameEn, nameAr: category.nameAr, sortOrder: category.sortOrder },
    });
    categoryIds.set(category.slug, row.id);
  }
  for (const brand of BRANDS) {
    await tx.brand.upsert({ where: { slug: brand.slug }, update: {}, create: { ...brand } });
  }
}

async function seedProducts(tx: Tx) {
  let created = 0;
  for (const product of PRODUCTS) {
    const existing = await tx.product.findUnique({ where: { slug: product.slug }, select: { id: true } });
    if (existing) continue;

    // Sequential on purpose: a transaction uses a single connection.
    const brand = await tx.brand.findUniqueOrThrow({ where: { slug: product.brand } });
    const concentration = product.concentration
      ? await tx.concentration.findUniqueOrThrow({ where: { code: product.concentration } })
      : null;
    const family = product.family
      ? await tx.fragranceFamily.findUniqueOrThrow({ where: { code: product.family } })
      : null;
    const primaryCategory = await tx.category.findUniqueOrThrow({ where: { slug: product.primaryCategory } });
    const categories = await tx.category.findMany({ where: { slug: { in: product.categories } } });

    const noteRows = await tx.fragranceNote.findMany({
      where: { slug: { in: [...product.notes.top, ...product.notes.heart, ...product.notes.base] } },
    });
    const noteId = (slug: string) => noteRows.find((note) => note.slug === slug)!.id;

    const row = await tx.product.create({
      data: {
        slug: product.slug,
        type: product.type,
        status: product.status,
        publishedAt: product.status === "PUBLISHED" ? new Date() : null,
        brandId: brand.id,
        primaryCategoryId: primaryCategory.id,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        shortDescriptionEn: product.shortDescriptionEn,
        shortDescriptionAr: product.shortDescriptionAr,
        descriptionEn: product.descriptionEn,
        descriptionAr: product.descriptionAr,
        audience: product.audience,
        concentrationId: concentration?.id ?? null,
        fragranceFamilyId: family?.id ?? null,
        launchYear: product.launchYear,
        storageInstructionsEn: "Store in a cool, dry place away from direct sunlight.",
        storageInstructionsAr: "يُحفظ في مكان بارد وجاف بعيدًا عن أشعة الشمس المباشرة.",
        warningsEn: "Flammable. Avoid contact with eyes. For external use only.",
        warningsAr: "قابل للاشتعال. تجنّب ملامسة العينين. للاستعمال الخارجي فقط.",
        categories: { create: categories.map((category) => ({ categoryId: category.id })) },
        notes: {
          create: [
            ...product.notes.top.map((slug, index) => ({ noteId: noteId(slug), layer: "TOP" as const, sortOrder: index })),
            ...product.notes.heart.map((slug, index) => ({ noteId: noteId(slug), layer: "HEART" as const, sortOrder: index })),
            ...product.notes.base.map((slug, index) => ({ noteId: noteId(slug), layer: "BASE" as const, sortOrder: index })),
          ],
        },
      },
    });

    for (const [index, variant] of product.variants.entries()) {
      let barcode: { barcode: string; barcodeType: "EAN_13" | "CODE_128"; barcodeSource: "MANUFACTURER" | "INTERNAL" } | null = null;
      if (variant.barcode?.kind === "gs1-demo") {
        barcode = {
          barcode: `${variant.barcode.body}${gtinCheckDigit(variant.barcode.body)}`,
          barcodeType: "EAN_13",
          barcodeSource: "MANUFACTURER",
        };
      } else if (variant.barcode?.kind === "internal") {
        barcode = { barcode: variant.barcode.value, barcodeType: "CODE_128", barcodeSource: "INTERNAL" };
      }
      await tx.productVariant.create({
        data: {
          productId: row.id,
          sku: variant.sku,
          ...(barcode ?? {}),
          sizeMl: variant.sizeMl,
          nameEn: variant.nameEn ?? null,
          nameAr: variant.nameAr ?? null,
          isTester: variant.isTester ?? false,
          trackExpiry: variant.trackExpiry ?? false,
          sortOrder: index,
          prices: {
            create: variant.prices.map((price) => {
              const country = COUNTRIES.find((c) => c.code === price.country)!;
              return {
                countryCode: price.country,
                currencyCode: country.currencyCode,
                amount: price.amount,
                compareAtAmount: price.compareAt ?? null,
              };
            }),
          },
        },
      });
    }
    await refreshProductSearchText(tx, row.id);
    created += 1;
  }
  return created;
}

async function main() {
  const { password, generated } = resolveSeedPassword();
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@perfume.local").toLowerCase();

  const summary = await prisma.$transaction(
    async (tx) => {
      const { stores } = await seedOrganisation(tx);
      const rbac = await syncRbac(tx);
      const admin = await ensureStaffUser(tx, {
        email: adminEmail,
        name: "Super Admin",
        password,
        roleKey: "super_admin",
        scope: { type: "GLOBAL" },
      });
      for (const staff of DEMO_STAFF) {
        const scope =
          staff.scope.type === "STORE"
            ? { type: "STORE" as const, storeId: stores.get(staff.scope.storeCode)! }
            : staff.scope;
        await ensureStaffUser(tx, { email: staff.email, name: staff.name, password, roleKey: staff.role, scope });
      }
      await seedCatalogReference(tx);
      const productsCreated = await seedProducts(tx);
      await tx.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "system.seed",
          entityType: "system",
          summary: `Development seed: ${productsCreated} products created`,
        },
      });
      return { rbac, productsCreated, adminCreated: admin.createdCredential };
    },
    { timeout: 120_000 },
  );

  console.info("Seed complete:", JSON.stringify(summary, null, 2));
  if (summary.adminCreated) {
    console.info(`\nSuper Admin: ${adminEmail}`);
    console.info(
      generated
        ? `Generated password (shown once, store it now): ${password}`
        : "Password: value of SEED_ADMIN_PASSWORD",
    );
    console.info(`Demo staff (same password): ${DEMO_STAFF.map((s) => s.email).join(", ")}`);
  } else {
    console.info("\nExisting accounts kept their passwords.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
