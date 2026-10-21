import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { AppError, ConflictError, ForbiddenError, InvalidStateError, ValidationError } from "@/server/errors";
import { createBrand, setBrandActive, updateBrand } from "@/server/modules/catalog/brands.service";
import { createCategory, updateCategory } from "@/server/modules/catalog/categories.service";
import {
  changeProductStatus,
  createProduct,
  listProducts,
  updateProduct,
  updateProductNotes,
} from "@/server/modules/catalog/products.service";
import {
  changeVariantStatus,
  createVariant,
  setVariantPrices,
  updateVariant,
} from "@/server/modules/catalog/variants.service";
import { createAttribute } from "@/server/modules/catalog/attributes.service";
import { auditEntries, seedFixture, type Fixture } from "./fixtures";

let f: Fixture;

beforeEach(async () => {
  f = await seedFixture();
});

const VALID_EAN13 = "4006381333931";

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected the operation to fail");
}

async function makeProduct(overrides: Record<string, unknown> = {}) {
  const { id: brandId } = await createBrand(f.superAdmin, { nameEn: "Test House", nameAr: "دار الاختبار" });
  const { id } = await createProduct(f.catalogManager, {
    brandId,
    type: "FRAGRANCE",
    nameEn: "Royal Oud",
    nameAr: "عود ملكي",
    audience: "UNISEX",
    ...overrides,
  });
  return { productId: id, brandId };
}

const variantInput = (overrides: Record<string, unknown> = {}) => ({
  sku: "TEST-ROI-100",
  barcode: "",
  barcodeType: "",
  barcodeSource: "",
  sizeMl: "100",
  isTester: false,
  trackInventory: true,
  trackBatches: true,
  trackExpiry: false,
  ...overrides,
});

describe("brands", () => {
  it("creates a brand with a generated slug and audits it", async () => {
    const { id } = await createBrand(f.catalogManager, { nameEn: "Maison Étoile", nameAr: "ميزون إيتوال" });
    const brand = await db.brand.findUniqueOrThrow({ where: { id } });
    expect(brand.slug).toBe("maison-etoile");
    const audits = await auditEntries("catalog.brand.create");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.entityId).toBe(id);
    expect(audits[0]?.actorUserId).toBe(f.catalogManager.actor.kind === "user" ? f.catalogManager.actor.userId : null);
  });

  it("makes generated slugs unique but rejects a duplicate explicit slug", async () => {
    await createBrand(f.catalogManager, { nameEn: "Noor", nameAr: "نور" });
    const second = await createBrand(f.catalogManager, { nameEn: "Noor", nameAr: "نور ٢" });
    expect((await db.brand.findUniqueOrThrow({ where: { id: second.id } })).slug).toBe("noor-2");
    const error = await errorOf(createBrand(f.catalogManager, { nameEn: "Other", nameAr: "آخر", slug: "noor" }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.fieldErrors?.slug).toEqual(["errors.conflict.slug"]);
  });

  it("validates input on the server", async () => {
    const error = await errorOf(
      createBrand(f.catalogManager, { nameEn: "", nameAr: "x", websiteUrl: "javascript:alert(1)" }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fieldErrors?.nameEn).toEqual(["validation.required"]);
    expect(error.fieldErrors?.websiteUrl?.[0]).toBe("validation.url");
  });

  it("forbids staff without the permission and country-scoped managers", async () => {
    expect(await errorOf(createBrand(f.cashier, { nameEn: "X", nameAr: "س" }))).toBeInstanceOf(ForbiddenError);
    // business_manager holds catalog.brands.manage, but only at COUNTRY:SA — global master data needs GLOBAL scope.
    expect(await errorOf(createBrand(f.saManager, { nameEn: "X", nameAr: "س" }))).toBeInstanceOf(ForbiddenError);
    expect(await db.brand.count()).toBe(0);
  });

  it("updates and deactivates", async () => {
    const { id } = await createBrand(f.catalogManager, { nameEn: "Amber", nameAr: "عنبر" });
    await updateBrand(f.catalogManager, id, { nameEn: "Amber House", nameAr: "دار العنبر" });
    await setBrandActive(f.catalogManager, id, { isActive: false });
    const brand = await db.brand.findUniqueOrThrow({ where: { id } });
    expect(brand).toMatchObject({ nameEn: "Amber House", isActive: false, slug: "amber" });
    const [update] = await auditEntries("catalog.brand.update");
    expect(update?.before).toMatchObject({ nameEn: "Amber" });
    expect(update?.after).toMatchObject({ nameEn: "Amber House" });
  });
});

describe("categories", () => {
  it("prevents cycles in the hierarchy", async () => {
    const parent = await createCategory(f.catalogManager, { nameEn: "Perfumes", nameAr: "عطور" });
    const child = await createCategory(f.catalogManager, { nameEn: "Oriental", nameAr: "شرقي", parentId: parent.id });
    const error = await errorOf(
      updateCategory(f.catalogManager, parent.id, { nameEn: "Perfumes", nameAr: "عطور", parentId: child.id }),
    );
    expect(error).toBeInstanceOf(InvalidStateError);
    expect(error.messageKey).toBe("errors.invalidState.categoryCycle");
  });
});

describe("products", () => {
  it("creates a draft product with categories and a normalised search document", async () => {
    const category = await createCategory(f.catalogManager, { nameEn: "Oud", nameAr: "عود" });
    const { productId } = await makeProduct({
      categoryIds: [category.id],
      primaryCategoryId: category.id,
      nameAr: "عُود مَلَكي",
    });
    const product = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { categories: true } });
    expect(product.status).toBe("DRAFT");
    expect(product.slug).toBe("royal-oud");
    expect(product.categories.map((c) => c.categoryId)).toEqual([category.id]);
    expect(product.searchText).toContain("عود ملكي");
  });

  it("requires the primary category to be one of the categories", async () => {
    const category = await createCategory(f.catalogManager, { nameEn: "Oud", nameAr: "عود" });
    const error = await errorOf(makeProduct({ primaryCategoryId: category.id, categoryIds: [] }));
    expect(error.fieldErrors?.primaryCategoryId).toEqual(["validation.primaryCategoryNotSelected"]);
  });

  it("rejects an inactive brand for new products but keeps existing products editable", async () => {
    const { productId, brandId } = await makeProduct();
    await setBrandActive(f.catalogManager, brandId, { isActive: false });
    const error = await errorOf(
      createProduct(f.catalogManager, { brandId, type: "FRAGRANCE", nameEn: "New", nameAr: "جديد" }),
    );
    expect(error.messageKey).toBe("errors.invalidState.inactiveReference");
    await updateProduct(f.catalogManager, productId, {
      brandId,
      type: "FRAGRANCE",
      nameEn: "Royal Oud II",
      nameAr: "عود ملكي ٢",
    });
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).nameEn).toBe("Royal Oud II");
  });

  it("stores fragrance notes per layer", async () => {
    const { productId } = await makeProduct();
    const saffron = await createAttribute(f.catalogManager, "note", { nameEn: "Saffron", nameAr: "زعفران" });
    const oud = await createAttribute(f.catalogManager, "note", { nameEn: "Oud", nameAr: "عود" });
    await updateProductNotes(f.catalogManager, productId, { top: [saffron.id], heart: [oud.id], base: [oud.id] });
    const notes = await db.productFragranceNote.findMany({ where: { productId }, orderBy: { layer: "asc" } });
    expect(notes.map((note) => note.layer)).toEqual(["TOP", "HEART", "BASE"]);
    const duplicate = await errorOf(updateProductNotes(f.catalogManager, productId, { top: [oud.id, oud.id] }));
    expect(duplicate.fieldErrors?.top).toEqual(["validation.duplicateNote"]);
  });
});

describe("variants: SKU and barcode", () => {
  it("normalises SKUs and enforces uniqueness case-insensitively", async () => {
    const { productId } = await makeProduct();
    const { id } = await createVariant(f.catalogManager, productId, variantInput({ sku: " test-roi 100 " }));
    expect((await db.productVariant.findUniqueOrThrow({ where: { id } })).sku).toBe("TEST-ROI-100");
    const error = await errorOf(createVariant(f.catalogManager, productId, variantInput({ sku: "Test-Roi-100" })));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.fieldErrors?.sku).toEqual(["errors.conflict.sku"]);
  });

  it("validates GTIN check digits and barcode uniqueness", async () => {
    const { productId } = await makeProduct();
    const invalid = await errorOf(
      createVariant(
        f.catalogManager,
        productId,
        variantInput({ barcode: "4006381333932", barcodeType: "EAN_13", barcodeSource: "MANUFACTURER" }),
      ),
    );
    expect(invalid.fieldErrors?.barcode).toEqual(["validation.barcodeChecksum"]);

    await createVariant(
      f.catalogManager,
      productId,
      variantInput({ barcode: VALID_EAN13, barcodeType: "EAN_13", barcodeSource: "MANUFACTURER" }),
    );
    const duplicate = await errorOf(
      createVariant(
        f.catalogManager,
        productId,
        variantInput({ sku: "OTHER-SKU", barcode: VALID_EAN13, barcodeType: "EAN_13", barcodeSource: "MANUFACTURER" }),
      ),
    );
    expect(duplicate.fieldErrors?.barcode).toEqual(["errors.conflict.barcode"]);
  });

  it("refuses to label an internally generated code as a GTIN", async () => {
    const { productId } = await makeProduct();
    const error = await errorOf(
      createVariant(
        f.catalogManager,
        productId,
        variantInput({ barcode: VALID_EAN13, barcodeType: "EAN_13", barcodeSource: "INTERNAL" }),
      ),
    );
    expect(error.fieldErrors?.barcode).toEqual(["validation.barcodeSourceMismatch"]);
  });

  it("the database rejects duplicates even when two requests race", async () => {
    const { productId } = await makeProduct();
    const results = await Promise.allSettled([
      createVariant(f.catalogManager, productId, variantInput({ sku: "RACE-1" })),
      createVariant(f.catalogManager, productId, variantInput({ sku: "RACE-1" })),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictError);
    expect(await db.productVariant.count({ where: { sku: "RACE-1" } })).toBe(1);
    // The failed attempt's audit entry rolled back with its transaction.
    expect(await auditEntries("catalog.variant.create")).toHaveLength(1);
  });

  it("allows updating a variant while keeping its own SKU", async () => {
    const { productId } = await makeProduct();
    const { id } = await createVariant(f.catalogManager, productId, variantInput());
    await updateVariant(f.catalogManager, id, variantInput({ sizeMl: "75", nameEn: "Travel" }));
    const variant = await db.productVariant.findUniqueOrThrow({ where: { id } });
    expect(variant.sizeMl?.toFixed(2)).toBe("75.00");
    expect(variant.nameEn).toBe("Travel");
  });

  it("forces batch tracking when expiry tracking is enabled", async () => {
    const { productId } = await makeProduct();
    const { id } = await createVariant(
      f.catalogManager,
      productId,
      variantInput({ trackInventory: false, trackBatches: false, trackExpiry: true }),
    );
    expect(await db.productVariant.findUniqueOrThrow({ where: { id } })).toMatchObject({
      trackExpiry: true,
      trackBatches: true,
      trackInventory: true,
    });
  });
});

describe("market prices", () => {
  async function variantWithId() {
    const { productId } = await makeProduct();
    const { id } = await createVariant(f.catalogManager, productId, variantInput());
    return { productId, variantId: id };
  }

  it("stores exact decimal prices per market in the market currency", async () => {
    const { variantId } = await variantWithId();
    await setVariantPrices(f.superAdmin, variantId, {
      prices: [
        { countryCode: "SA", amount: "1,250.5", compareAtAmount: "1499.99", isActive: true },
        { countryCode: "EG", amount: "15000", compareAtAmount: "", isActive: true },
      ],
    });
    const prices = await db.productPrice.findMany({ where: { variantId }, orderBy: { countryCode: "asc" } });
    expect(
      prices.map((p) => [p.countryCode, p.currencyCode, p.amount.toFixed(2), p.compareAtAmount?.toFixed(2) ?? null]),
    ).toEqual([
      ["EG", "EGP", "15000.00", null],
      ["SA", "SAR", "1250.50", "1499.99"],
    ]);
  });

  it("lets a KSA-scoped manager change only KSA prices", async () => {
    const { variantId } = await variantWithId();
    await setVariantPrices(f.superAdmin, variantId, {
      prices: [
        { countryCode: "SA", amount: "100", compareAtAmount: "", isActive: true },
        { countryCode: "EG", amount: "1200", compareAtAmount: "", isActive: true },
      ],
    });
    // Unchanged EG entry + changed SA entry: allowed.
    await setVariantPrices(f.saManager, variantId, {
      prices: [
        { countryCode: "SA", amount: "110", compareAtAmount: "", isActive: true },
        { countryCode: "EG", amount: "1200.00", compareAtAmount: "", isActive: true },
      ],
    });
    // Changing EG: forbidden, and nothing is written.
    const error = await errorOf(
      setVariantPrices(f.saManager, variantId, {
        prices: [
          { countryCode: "SA", amount: "120", compareAtAmount: "", isActive: true },
          { countryCode: "EG", amount: "1", compareAtAmount: "", isActive: true },
        ],
      }),
    );
    expect(error).toBeInstanceOf(ForbiddenError);
    const prices = await db.productPrice.findMany({ where: { variantId }, orderBy: { countryCode: "asc" } });
    expect(prices.map((p) => p.amount.toFixed(2))).toEqual(["1200.00", "110.00"]);
  });

  it("rejects a compare-at price that is not higher and more than two decimals", async () => {
    const { variantId } = await variantWithId();
    const error = await errorOf(
      setVariantPrices(f.superAdmin, variantId, {
        prices: [{ countryCode: "SA", amount: "100.999", compareAtAmount: "90", isActive: true }],
      }),
    );
    expect(error.fieldErrors?.["prices.0.amount"]).toEqual(["validation.moneyPrecision"]);
    const second = await errorOf(
      setVariantPrices(f.superAdmin, variantId, {
        prices: [{ countryCode: "SA", amount: "100", compareAtAmount: "90", isActive: true }],
      }),
    );
    expect(second.fieldErrors?.["prices.0.compareAtAmount"]).toEqual(["validation.compareAtGreater"]);
  });

  it("removes a market price when the amount is cleared", async () => {
    const { variantId } = await variantWithId();
    await setVariantPrices(f.superAdmin, variantId, {
      prices: [{ countryCode: "SA", amount: "100", compareAtAmount: "", isActive: true }],
    });
    await setVariantPrices(f.superAdmin, variantId, {
      prices: [{ countryCode: "SA", amount: "", compareAtAmount: "", isActive: true }],
    });
    expect(await db.productPrice.count({ where: { variantId } })).toBe(0);
    expect(await auditEntries("catalog.price.update")).toHaveLength(2);
  });

  it("the database refuses a price in the wrong currency for the market", async () => {
    const { variantId } = await variantWithId();
    await expect(
      db.productPrice.create({ data: { variantId, countryCode: "SA", currencyCode: "EGP", amount: "10" } }),
    ).rejects.toThrow();
  });
});

describe("publishing workflow", () => {
  it("cannot publish without an active, priced variant", async () => {
    const { productId } = await makeProduct();
    const error = await errorOf(changeProductStatus(f.catalogManager, productId, { status: "PUBLISHED" }));
    expect(error.messageKey).toBe("errors.invalidState.publishRequirements");

    const { id: variantId } = await createVariant(f.catalogManager, productId, variantInput());
    await setVariantPrices(f.catalogManager, variantId, {
      prices: [{ countryCode: "SA", amount: "250", compareAtAmount: "", isActive: true }],
    });
    await changeProductStatus(f.catalogManager, productId, { status: "PUBLISHED" });
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.status).toBe("PUBLISHED");
    expect(product.publishedAt).not.toBeNull();
  });

  it("does not count prices in inactive markets", async () => {
    const { productId } = await makeProduct();
    const { id: variantId } = await createVariant(f.catalogManager, productId, variantInput());
    await setVariantPrices(f.catalogManager, variantId, {
      prices: [{ countryCode: "EG", amount: "250", compareAtAmount: "", isActive: true }],
    });
    await db.country.update({ where: { code: "EG" }, data: { isActive: false } });
    const error = await errorOf(changeProductStatus(f.catalogManager, productId, { status: "PUBLISHED" }));
    expect(error.messageKey).toBe("errors.invalidState.publishRequirements");
  });

  it("enforces the state machine and the publish permission", async () => {
    const { productId } = await makeProduct();
    const { id: variantId } = await createVariant(f.catalogManager, productId, variantInput());
    await setVariantPrices(f.catalogManager, variantId, {
      prices: [{ countryCode: "SA", amount: "250", compareAtAmount: "", isActive: true }],
    });
    await changeProductStatus(f.catalogManager, productId, { status: "PUBLISHED" });
    const backToDraft = await errorOf(changeProductStatus(f.catalogManager, productId, { status: "DRAFT" }));
    expect(backToDraft.messageKey).toBe("errors.invalidState.transition");
    // Country-scoped managers cannot change global product visibility.
    expect(await errorOf(changeProductStatus(f.saManager, productId, { status: "INACTIVE" }))).toBeInstanceOf(
      ForbiddenError,
    );
    await changeProductStatus(f.catalogManager, productId, { status: "DISCONTINUED", reason: "End of line" });
    const [audit] = await auditEntries("catalog.product.status").then((entries) => entries.slice(-1));
    expect(audit?.reason).toBe("End of line");
    // Variants of a discontinued product cannot be reactivated.
    await changeVariantStatus(f.catalogManager, variantId, { status: "INACTIVE" });
    const reactivate = await errorOf(changeVariantStatus(f.catalogManager, variantId, { status: "ACTIVE" }));
    expect(reactivate.messageKey).toBe("errors.invalidState.variantProductInactive");
  });
});

describe("product search", () => {
  it("finds products by Arabic text regardless of hamza or diacritics, and by exact SKU/barcode", async () => {
    const { productId } = await makeProduct({ nameAr: "أمير العود" });
    await createVariant(
      f.catalogManager,
      productId,
      variantInput({ sku: "AMIR-50", barcode: VALID_EAN13, barcodeType: "EAN_13", barcodeSource: "MANUFACTURER" }),
    );

    const arabic = await listProducts(f.viewer, { q: "امير" });
    expect(arabic.rows.map((row) => row.id)).toEqual([productId]);

    const bySku = await listProducts(f.viewer, { q: "amir-50" });
    expect(bySku.exactMatch?.sku).toBe("AMIR-50");

    const byBarcode = await listProducts(f.viewer, { q: "٤٠٠٦٣٨١٣٣٣٩٣١" });
    expect(byBarcode.exactMatch?.productId).toBe(productId);

    const none = await listProducts(f.viewer, { q: "vanilla" });
    expect(none.total).toBe(0);
  });

  it("filters by status and paginates", async () => {
    const { id: brandId } = await createBrand(f.catalogManager, { nameEn: "Bulk", nameAr: "جملة" });
    for (let index = 0; index < 23; index += 1) {
      await createProduct(f.catalogManager, {
        brandId,
        type: "FRAGRANCE",
        nameEn: `Scent ${index}`,
        nameAr: `عطر ${index}`,
      });
    }
    const first = await listProducts(f.viewer, { status: "DRAFT", page: "1" });
    const last = await listProducts(f.viewer, { status: "DRAFT", page: "2" });
    expect(first.total).toBe(23);
    expect(first.rows).toHaveLength(20);
    expect(last.rows).toHaveLength(3);
    expect((await listProducts(f.viewer, { status: "PUBLISHED" })).total).toBe(0);
    // Invalid query parameters fall back to safe defaults instead of failing.
    expect((await listProducts(f.viewer, { status: "NOPE", page: "-4" })).page).toBe(1);
  });

  it("requires products.view", async () => {
    const customerLike = { ...f.viewer, actor: { ...f.viewer.actor, grants: new Map() } } as typeof f.viewer;
    expect(await errorOf(listProducts(customerLike, {}))).toBeInstanceOf(ForbiddenError);
  });
});

describe("audit log integrity", () => {
  it("is append-only at the database level", async () => {
    await createBrand(f.catalogManager, { nameEn: "Audit", nameAr: "تدقيق" });
    const [entry] = await auditEntries("catalog.brand.create");
    await expect(db.auditLog.update({ where: { id: entry!.id }, data: { action: "tampered" } })).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: entry!.id } })).rejects.toThrow();
    expect(await auditEntries("catalog.brand.create")).toHaveLength(1);
  });
});
