import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { normalizeSearchText } from "@/lib/catalog-text";
import { z } from "@/lib/validation/zod";
import { db, Prisma } from "@/server/db";

/**
 * Public storefront reads. Only PUBLISHED products with at least one ACTIVE
 * variant priced (actively) in the visitor's market are listed. No
 * authentication is involved and nothing here mutates data.
 */

export const MARKET_COOKIE = "market";
export const STORE_PAGE_SIZE = 12;

export type Market = {
  code: string;
  nameEn: string;
  nameAr: string;
  currencyCode: string;
  minorUnits: number;
  pricesIncludeTax: boolean;
};

export const listMarkets = cache(async (): Promise<Market[]> => {
  const countries = await db.country.findMany({
    where: { isActive: true },
    orderBy: { code: "desc" },
    include: { currency: true },
  });
  return countries.map((country) => ({
    code: country.code,
    nameEn: country.nameEn,
    nameAr: country.nameAr,
    currencyCode: country.currencyCode,
    minorUnits: country.currency.minorUnits,
    pricesIncludeTax: country.pricesIncludeTax,
  }));
});

/** The visitor's market: cookie choice if active, else DEFAULT_MARKET, else the first active market. */
export const getCurrentMarket = cache(async (): Promise<Market | null> => {
  const markets = await listMarkets();
  const chosen = (await cookies()).get(MARKET_COOKIE)?.value;
  return (
    markets.find((market) => market.code === chosen) ??
    markets.find((market) => market.code === (process.env.DEFAULT_MARKET ?? "SA")) ??
    markets[0] ??
    null
  );
});

export const storeQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,120}$/)
    .optional()
    .catch(undefined),
  brand: z
    .string()
    .regex(/^[a-z0-9-]{1,120}$/)
    .optional()
    .catch(undefined),
  audience: z.enum(["MEN", "WOMEN", "UNISEX"]).optional().catch(undefined),
  family: z
    .string()
    .regex(/^[A-Z0-9_]{1,40}$/)
    .optional()
    .catch(undefined),
  sort: z.enum(["newest", "priceAsc", "priceDesc", "name"]).default("newest").catch("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

export type StoreQuery = z.output<typeof storeQuerySchema>;

export type StoreProductCard = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  brandNameEn: string;
  brandNameAr: string;
  concentrationEn: string | null;
  concentrationAr: string | null;
  familyCode: string | null;
  imageKey: string | null;
  imageAltEn: string | null;
  imageAltAr: string | null;
  minPrice: string;
  compareAtPrice: string | null;
  variantCount: number;
};

async function descendantCategoryIds(slug: string): Promise<string[]> {
  const categories = await db.category.findMany({
    where: { isActive: true },
    select: { id: true, parentId: true, slug: true },
  });
  const root = categories.find((category) => category.slug === slug);
  if (!root) return [];
  const ids = new Set([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/** Published, priced products for a market with filters, sorting and paging. */
export async function listStoreProducts(market: Market, rawQuery: unknown, locale: string) {
  const query = storeQuerySchema.parse(rawQuery ?? {});
  const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'PUBLISHED'`, Prisma.sql`b.is_active = true`];
  if (query.q) {
    const normalized = normalizeSearchText(query.q);
    if (normalized) conditions.push(Prisma.sql`p.search_text LIKE ${`%${normalized.replace(/[%_\\]/g, "")}%`}`);
  }
  if (query.brand) conditions.push(Prisma.sql`b.slug = ${query.brand}`);
  if (query.audience) conditions.push(Prisma.sql`p.audience = ${query.audience}::"Audience"`);
  if (query.family) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM fragrance_families ff WHERE ff.id = p.fragrance_family_id AND ff.code = ${query.family})`,
    );
  }
  if (query.category) {
    const ids = await descendantCategoryIds(query.category);
    if (ids.length === 0) return { products: [] as StoreProductCard[], total: 0, page: 1, pageCount: 1, query };
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}))`,
    );
  }
  const where = Prisma.join(conditions, " AND ");
  const priced = Prisma.sql`
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    JOIN product_variants v ON v.product_id = p.id AND v.status = 'ACTIVE'
    JOIN product_prices pp ON pp.variant_id = v.id AND pp.country_code = ${market.code} AND pp.is_active = true
    WHERE ${where}`;

  const counted = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(DISTINCT p.id) AS count ${priced}`;
  const total = Number(counted[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / STORE_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const orderBy =
    query.sort === "priceAsc"
      ? Prisma.sql`MIN(pp.amount) ASC, p.id`
      : query.sort === "priceDesc"
        ? Prisma.sql`MIN(pp.amount) DESC, p.id`
        : query.sort === "name"
          ? locale === "ar"
            ? Prisma.sql`p.name_ar ASC, p.id`
            : Prisma.sql`p.name_en ASC, p.id`
          : Prisma.sql`p.published_at DESC NULLS LAST, p.id`;
  const rows = await db.$queryRaw<Array<{ id: string; min_price: string; variant_count: bigint }>>`
    SELECT p.id, MIN(pp.amount)::text AS min_price, COUNT(DISTINCT v.id) AS variant_count
    ${priced}
    GROUP BY p.id, p.published_at, p.name_en, p.name_ar
    ORDER BY ${orderBy}
    LIMIT ${STORE_PAGE_SIZE} OFFSET ${(page - 1) * STORE_PAGE_SIZE}`;

  const details = await db.product.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      brand: { select: { nameEn: true, nameAr: true } },
      concentration: { select: { nameEn: true, nameAr: true } },
      family: { select: { code: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true, altEn: true, altAr: true } },
      variants: {
        where: { status: "ACTIVE" },
        select: {
          prices: {
            where: { countryCode: market.code, isActive: true },
            select: { amount: true, compareAtAmount: true },
          },
        },
      },
    },
  });
  const byId = new Map(details.map((detail) => [detail.id, detail]));
  const products: StoreProductCard[] = rows.flatMap((row) => {
    const detail = byId.get(row.id);
    if (!detail) return [];
    const cheapest = detail.variants
      .flatMap((variant) => variant.prices)
      .sort((a, b) => a.amount.comparedTo(b.amount))[0];
    return [
      {
        id: detail.id,
        slug: detail.slug,
        nameEn: detail.nameEn,
        nameAr: detail.nameAr,
        brandNameEn: detail.brand.nameEn,
        brandNameAr: detail.brand.nameAr,
        concentrationEn: detail.concentration?.nameEn ?? null,
        concentrationAr: detail.concentration?.nameAr ?? null,
        familyCode: detail.family?.code ?? null,
        imageKey: detail.images[0]?.storageKey ?? null,
        imageAltEn: detail.images[0]?.altEn ?? null,
        imageAltAr: detail.images[0]?.altAr ?? null,
        minPrice: cheapest ? cheapest.amount.toFixed(market.minorUnits) : row.min_price,
        compareAtPrice: cheapest?.compareAtAmount ? cheapest.compareAtAmount.toFixed(market.minorUnits) : null,
        variantCount: Number(row.variant_count),
      },
    ];
  });
  return { products, total, page, pageCount, query: { ...query, page } };
}

/** Full product page data. Returns null unless the product is PUBLISHED. */
export async function getStoreProduct(slug: string, market: Market | null) {
  const product = await db.product.findFirst({
    where: { slug, status: "PUBLISHED", brand: { isActive: true } },
    include: {
      brand: { select: { slug: true, nameEn: true, nameAr: true } },
      concentration: { select: { nameEn: true, nameAr: true } },
      family: { select: { code: true, nameEn: true, nameAr: true } },
      primaryCategory: { select: { slug: true, nameEn: true, nameAr: true } },
      notes: {
        orderBy: [{ layer: "asc" }, { sortOrder: "asc" }],
        include: { note: { select: { nameEn: true, nameAr: true } } },
      },
      images: { orderBy: { sortOrder: "asc" } },
      variants: {
        where: { status: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          prices: {
            where: { isActive: true, ...(market ? { countryCode: market.code } : { countryCode: "__none__" }) },
          },
        },
      },
    },
  });
  if (!product) return null;
  const variants = product.variants.map((variant) => {
    const price = variant.prices[0];
    return {
      id: variant.id,
      sku: variant.sku,
      nameEn: variant.nameEn,
      nameAr: variant.nameAr,
      sizeMl: variant.sizeMl ? variant.sizeMl.toString() : null,
      isTester: variant.isTester,
      barcode: variant.barcode,
      barcodeSource: variant.barcodeSource,
      price: price && market ? price.amount.toFixed(market.minorUnits) : null,
      compareAtPrice: price?.compareAtAmount && market ? price.compareAtAmount.toFixed(market.minorUnits) : null,
    };
  });
  return { ...product, variants, sellableVariants: variants.filter((variant) => variant.price !== null) };
}

export const listStoreCategories = cache(async () =>
  db.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: { id: true, slug: true, parentId: true, nameEn: true, nameAr: true },
  }),
);

export const listStoreBrands = cache(async () =>
  db.brand.findMany({
    where: { isActive: true, products: { some: { status: "PUBLISHED" } } },
    orderBy: { nameEn: "asc" },
    select: { slug: true, nameEn: true, nameAr: true },
  }),
);

export const listStoreFamilies = cache(async () =>
  db.fragranceFamily.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, nameEn: true, nameAr: true },
  }),
);

/** Published product slugs for the sitemap. */
export async function listPublishedSlugs() {
  return db.product.findMany({
    where: { status: "PUBLISHED", brand: { isActive: true } },
    select: { slug: true, updatedAt: true },
  });
}
