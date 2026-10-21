import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createBrand, setBrandActive } from "@/server/modules/catalog/brands.service";
import { createCategory } from "@/server/modules/catalog/categories.service";
import { changeProductStatus, createProduct } from "@/server/modules/catalog/products.service";
import { changeVariantStatus, createVariant, setVariantPrices } from "@/server/modules/catalog/variants.service";
import {
  getStoreProduct,
  listMarkets,
  listStoreProducts,
  type Market,
} from "@/server/modules/storefront/storefront.service";
import { seedFixture, type Fixture } from "./fixtures";

let f: Fixture;
let sa: Market;
let eg: Market;

beforeEach(async () => {
  f = await seedFixture();
  const markets = await listMarkets();
  sa = markets.find((market) => market.code === "SA")!;
  eg = markets.find((market) => market.code === "EG")!;
});

type Seeded = { productId: string; variantIds: string[]; slug: string };

/** Create a product with variants priced per market (amounts keyed by country code). */
async function seedProduct(options: {
  brandId: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  prices: Array<Partial<Record<"SA" | "EG", string>>>;
  publish?: boolean;
  categoryIds?: string[];
  audience?: "MEN" | "WOMEN" | "UNISEX";
}): Promise<Seeded> {
  const { id: productId } = await createProduct(f.catalogManager, {
    brandId: options.brandId,
    type: "FRAGRANCE",
    nameEn: options.nameEn,
    nameAr: options.nameAr,
    audience: options.audience ?? "UNISEX",
    categoryIds: options.categoryIds ?? [],
    primaryCategoryId: options.categoryIds?.[0] ?? "",
  });
  const variantIds: string[] = [];
  for (const [index, amounts] of options.prices.entries()) {
    const { id } = await createVariant(f.catalogManager, productId, {
      sku: `${options.sku}-${index + 1}`,
      barcode: "",
      barcodeType: "",
      barcodeSource: "",
      sizeMl: String(50 * (index + 1)),
      isTester: false,
      trackInventory: true,
      trackBatches: true,
      trackExpiry: false,
    });
    await setVariantPrices(f.superAdmin, id, {
      prices: Object.entries(amounts).map(([countryCode, amount]) => ({
        countryCode,
        amount,
        compareAtAmount: "",
        isActive: true,
      })),
    });
    variantIds.push(id);
  }
  if (options.publish ?? true) await changeProductStatus(f.catalogManager, productId, { status: "PUBLISHED" });
  const { slug } = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { slug: true } });
  return { productId, variantIds, slug };
}

describe("storefront listing", () => {
  it("lists only published products with an active price in the visitor's market", async () => {
    const { id: brandId } = await createBrand(f.superAdmin, { nameEn: "House", nameAr: "الدار" });
    await seedProduct({
      brandId,
      nameEn: "Both Markets",
      nameAr: "السوقين",
      sku: "BOTH",
      prices: [{ SA: "100", EG: "1200" }],
    });
    await seedProduct({ brandId, nameEn: "Saudi Only", nameAr: "السعودية فقط", sku: "SAONLY", prices: [{ SA: "80" }] });
    await seedProduct({
      brandId,
      nameEn: "Draft",
      nameAr: "مسودة",
      sku: "DRAFT",
      prices: [{ SA: "50", EG: "600" }],
      publish: false,
    });

    const saResult = await listStoreProducts(sa, {}, "en");
    expect(saResult.products.map((product) => product.nameEn).sort()).toEqual(["Both Markets", "Saudi Only"]);
    expect(saResult.total).toBe(2);

    const egResult = await listStoreProducts(eg, {}, "en");
    expect(egResult.products.map((product) => [product.nameEn, product.minPrice])).toEqual([
      ["Both Markets", "1200.00"],
    ]);
  });

  it("shows the lowest active variant price and sorts by it", async () => {
    const { id: brandId } = await createBrand(f.superAdmin, { nameEn: "House", nameAr: "الدار" });
    await seedProduct({
      brandId,
      nameEn: "Expensive",
      nameAr: "غالي",
      sku: "EXP",
      prices: [{ SA: "900" }, { SA: "1500" }],
    });
    const cheap = await seedProduct({
      brandId,
      nameEn: "Cheap",
      nameAr: "رخيص",
      sku: "CHP",
      prices: [{ SA: "300" }, { SA: "120.5" }],
    });

    const ascending = await listStoreProducts(sa, { sort: "priceAsc" }, "en");
    expect(ascending.products.map((product) => [product.nameEn, product.minPrice, product.variantCount])).toEqual([
      ["Cheap", "120.50", 2],
      ["Expensive", "900.00", 2],
    ]);
    const descending = await listStoreProducts(sa, { sort: "priceDesc" }, "en");
    expect(descending.products.map((product) => product.nameEn)).toEqual(["Expensive", "Cheap"]);

    // Deactivating the cheapest variant removes its price from the listing.
    await changeVariantStatus(f.catalogManager, cheap.variantIds[1]!, { status: "INACTIVE" });
    const after = await listStoreProducts(sa, { sort: "priceAsc" }, "en");
    expect(after.products.find((product) => product.nameEn === "Cheap")).toMatchObject({
      minPrice: "300.00",
      variantCount: 1,
    });
  });

  it("filters by brand, audience, category (including sub-categories) and normalised Arabic search", async () => {
    const { id: houseA } = await createBrand(f.superAdmin, { nameEn: "House A", nameAr: "الدار أ", slug: "house-a" });
    const { id: houseB } = await createBrand(f.superAdmin, { nameEn: "House B", nameAr: "الدار ب", slug: "house-b" });
    const parent = await createCategory(f.catalogManager, { nameEn: "Perfumes", nameAr: "عطور", slug: "perfumes" });
    const child = await createCategory(f.catalogManager, {
      nameEn: "Oriental",
      nameAr: "شرقي",
      slug: "oriental",
      parentId: parent.id,
    });
    await seedProduct({
      brandId: houseA,
      nameEn: "Royal Oud",
      nameAr: "عُود أَميري",
      sku: "ROUD",
      prices: [{ SA: "500" }],
      categoryIds: [child.id],
      audience: "MEN",
    });
    await seedProduct({
      brandId: houseB,
      nameEn: "Rose Water",
      nameAr: "ماء الورد",
      sku: "ROSE",
      prices: [{ SA: "90" }],
      audience: "WOMEN",
    });

    const names = async (query: Record<string, string>) =>
      (await listStoreProducts(sa, query, "en")).products.map((product) => product.nameEn);
    expect(await names({ brand: "house-b" })).toEqual(["Rose Water"]);
    expect(await names({ audience: "MEN" })).toEqual(["Royal Oud"]);
    expect(await names({ category: "perfumes" })).toEqual(["Royal Oud"]);
    expect(await names({ category: "no-such-category" })).toEqual([]);
    // Diacritics and hamza forms are normalised on both sides.
    expect(await names({ q: "عود اميري" })).toEqual(["Royal Oud"]);
    expect(await names({ q: "ROSE" })).toEqual(["Rose Water"]);
  });

  it("ignores malformed query parameters instead of failing", async () => {
    const { id: brandId } = await createBrand(f.superAdmin, { nameEn: "House", nameAr: "الدار" });
    await seedProduct({ brandId, nameEn: "Only", nameAr: "وحيد", sku: "ONLY", prices: [{ SA: "10" }] });
    const result = await listStoreProducts(
      sa,
      {
        sort: "'; DROP TABLE products; --",
        page: "-4",
        category: "../../etc",
        audience: "ALIENS",
        q: "x".repeat(500),
        family: "<script>",
      },
      "en",
    );
    expect(result.query).toMatchObject({
      sort: "newest",
      page: 1,
      category: undefined,
      audience: undefined,
      q: undefined,
      family: undefined,
    });
    expect(result.products.map((product) => product.nameEn)).toEqual(["Only"]);
    // A page beyond the last one is clamped.
    expect((await listStoreProducts(sa, { page: "40" }, "en")).page).toBe(1);
  });
});

describe("storefront product page", () => {
  it("returns variants with the market price and marks unpriced ones as not sellable", async () => {
    const { id: brandId } = await createBrand(f.superAdmin, { nameEn: "House", nameAr: "الدار" });
    const seeded = await seedProduct({
      brandId,
      nameEn: "Split",
      nameAr: "منقسم",
      sku: "SPLIT",
      prices: [{ SA: "100", EG: "1500" }, { SA: "180" }],
    });

    const inSa = await getStoreProduct(seeded.slug, sa);
    expect(inSa?.variants.map((variant) => variant.price)).toEqual(["100.00", "180.00"]);
    const inEg = await getStoreProduct(seeded.slug, eg);
    expect(inEg?.variants.map((variant) => variant.price)).toEqual(["1500.00", null]);
    expect(inEg?.sellableVariants).toHaveLength(1);
  });

  it("is not available for drafts or for products of a deactivated brand", async () => {
    const { id: brandId } = await createBrand(f.superAdmin, { nameEn: "House", nameAr: "الدار" });
    const draft = await seedProduct({
      brandId,
      nameEn: "Draft",
      nameAr: "مسودة",
      sku: "DRF",
      prices: [{ SA: "10" }],
      publish: false,
    });
    const live = await seedProduct({ brandId, nameEn: "Live", nameAr: "منشور", sku: "LIVE", prices: [{ SA: "10" }] });
    expect(await getStoreProduct(draft.slug, sa)).toBeNull();
    expect(await getStoreProduct(live.slug, sa)).not.toBeNull();

    await setBrandActive(f.catalogManager, brandId, { isActive: false });
    expect(await getStoreProduct(live.slug, sa)).toBeNull();
    expect((await listStoreProducts(sa, {}, "en")).products).toEqual([]);
  });
});
