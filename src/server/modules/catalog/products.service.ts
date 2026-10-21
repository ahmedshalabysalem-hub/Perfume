import "server-only";
import { normalizeBarcode } from "@/lib/barcode";
import { normalizeSearchText, normalizeSku } from "@/lib/catalog-text";
import {
  productContentSchema,
  productListQuerySchema,
  productNotesSchema,
  productSchema,
  productStatusChangeSchema,
  type ProductListQuery,
} from "@/lib/schemas/catalog";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, type DbClient, type Prisma } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan } from "@/server/rbac/authorize";
import { parseInput } from "@/server/validation";
import { isProductTransitionAllowed, productTransitionPermission } from "./lifecycle";
import { refreshProductSearchText } from "./search-document";
import { resolveSlug } from "./slugs";

export const PRODUCT_PAGE_SIZE = 20;

// ─── Listing & lookup ────────────────────────────────────────────────────────

export type ProductListRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  brandNameEn: string;
  brandNameAr: string;
  type: string;
  status: string;
  variantCount: number;
  pricedMarkets: string[];
  updatedAt: Date;
  imageKey: string | null;
};

export type ProductListResult = {
  rows: ProductListRow[];
  total: number;
  page: number;
  pageCount: number;
  query: ProductListQuery;
  exactMatch: { productId: string; variantId: string; sku: string } | null;
};

/** Exact SKU or barcode match — what a barcode scanner types into the search box. */
export async function findVariantByCode(client: DbClient, code: string) {
  const sku = normalizeSku(code);
  const barcode = normalizeBarcode(code);
  if (!sku && !barcode) return null;
  return client.productVariant.findFirst({
    where: { OR: [{ sku }, { barcode }] },
    select: { id: true, sku: true, barcode: true, productId: true },
  });
}

export async function listProducts(ctx: ServiceContext, rawQuery: unknown, locale = "en"): Promise<ProductListResult> {
  assertCan(ctx.actor, "products.view");
  const query = productListQuerySchema.parse(rawQuery ?? {});

  const exact = query.q ? await findVariantByCode(db, query.q) : null;
  const normalized = query.q ? normalizeSearchText(query.q) : "";

  const where: Prisma.ProductWhereInput = {
    ...(query.q
      ? {
          OR: [
            ...(normalized ? [{ searchText: { contains: normalized } }] : []),
            ...(exact ? [{ id: exact.productId }] : []),
          ],
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.brand ? { brandId: query.brand } : {}),
    ...(query.category ? { categories: { some: { categoryId: query.category } } } : {}),
    ...(query.type ? { type: query.type } : {}),
  };
  // An empty OR matches nothing, which is the right answer for a query of only punctuation.
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    query.sort === "name"
      ? [locale === "ar" ? { nameAr: "asc" } : { nameEn: "asc" }, { id: "asc" }]
      : query.sort === "created"
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ updatedAt: "desc" }, { id: "desc" }];

  const total = await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const products = await db.product.findMany({
    where,
    orderBy,
    skip: (page - 1) * PRODUCT_PAGE_SIZE,
    take: PRODUCT_PAGE_SIZE,
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      type: true,
      status: true,
      updatedAt: true,
      brand: { select: { nameEn: true, nameAr: true } },
      _count: { select: { variants: true } },
      variants: {
        where: { status: "ACTIVE" },
        select: { prices: { where: { isActive: true }, select: { countryCode: true } } },
      },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } },
    },
  });

  return {
    rows: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      nameEn: product.nameEn,
      nameAr: product.nameAr,
      brandNameEn: product.brand.nameEn,
      brandNameAr: product.brand.nameAr,
      type: product.type,
      status: product.status,
      variantCount: product._count.variants,
      pricedMarkets: [
        ...new Set(product.variants.flatMap((variant) => variant.prices.map((price) => price.countryCode))),
      ].sort(),
      updatedAt: product.updatedAt,
      imageKey: product.images[0]?.storageKey ?? null,
    })),
    total,
    page,
    pageCount,
    query: { ...query, page },
    exactMatch: exact ? { productId: exact.productId, variantId: exact.id, sku: exact.sku } : null,
  };
}

export async function getProductForAdmin(ctx: ServiceContext, id: string) {
  assertCan(ctx.actor, "products.view");
  const product = await db.product.findUnique({
    where: { id },
    include: {
      brand: true,
      categories: { select: { categoryId: true } },
      notes: { orderBy: [{ layer: "asc" }, { sortOrder: "asc" }], include: { note: true } },
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { prices: { orderBy: { countryCode: "asc" } } },
      },
      images: { orderBy: { sortOrder: "asc" } },
      compliance: { orderBy: [{ countryCode: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!product) throw new NotFoundError("product");
  return product;
}

/** Options for product forms (active reference data + current selections). */
export async function getProductFormOptions(ctx: ServiceContext) {
  assertCan(ctx.actor, "products.view");
  const brands = await db.brand.findMany({
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, nameAr: true, isActive: true },
  });
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    select: { id: true, parentId: true, nameEn: true, nameAr: true, isActive: true },
  });
  const concentrations = await db.concentration.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameEn: true, nameAr: true, isActive: true },
  });
  const families = await db.fragranceFamily.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameEn: true, nameAr: true, isActive: true },
  });
  const notes = await db.fragranceNote.findMany({
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, nameAr: true, isActive: true },
  });
  const countries = await db.country.findMany({
    orderBy: { code: "desc" },
    select: {
      code: true,
      nameEn: true,
      nameAr: true,
      currencyCode: true,
      pricesIncludeTax: true,
      isActive: true,
      currency: { select: { minorUnits: true } },
    },
  });
  return { brands, categories, concentrations, families, notes, countries };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

type ProductData = ReturnType<typeof productSchema.parse>;

/**
 * Newly referenced brand / concentration / family / categories must exist and
 * be active. References that are unchanged on update may stay inactive, so an
 * old product remains editable after its brand is retired.
 */
async function assertReferencesUsable(
  client: DbClient,
  data: ProductData,
  existing: {
    brandId: string;
    concentrationId: string | null;
    fragranceFamilyId: string | null;
    categoryIds: string[];
  } | null,
): Promise<void> {
  if (!existing || existing.brandId !== data.brandId) {
    const brand = await client.brand.findUnique({ where: { id: data.brandId }, select: { isActive: true } });
    if (!brand) throw new NotFoundError("brand");
    if (!brand.isActive) throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "brand" });
  }
  if (data.concentrationId && data.concentrationId !== existing?.concentrationId) {
    const concentration = await client.concentration.findUnique({
      where: { id: data.concentrationId },
      select: { isActive: true },
    });
    if (!concentration) throw new NotFoundError("concentration");
    if (!concentration.isActive)
      throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "concentration" });
  }
  if (data.fragranceFamilyId && data.fragranceFamilyId !== existing?.fragranceFamilyId) {
    const family = await client.fragranceFamily.findUnique({
      where: { id: data.fragranceFamilyId },
      select: { isActive: true },
    });
    if (!family) throw new NotFoundError("fragrance_family");
    if (!family.isActive)
      throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "fragrance_family" });
  }
  const added = data.categoryIds.filter((id) => !existing?.categoryIds.includes(id));
  if (added.length > 0) {
    const categories = await client.category.findMany({
      where: { id: { in: added } },
      select: { id: true, isActive: true },
    });
    if (categories.length !== added.length) throw new NotFoundError("category");
    if (categories.some((category) => !category.isActive)) {
      throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "category" });
    }
  }
}

function mapProductConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "slug"))
    throw new ConflictError("errors.conflict.slug", { slug: ["errors.conflict.slug"] });
  throw error;
}

export async function createProduct(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, "products.create", "global");
  const data = parseInput(productSchema, input);
  await assertReferencesUsable(db, data, null);
  const { slug } = await resolveSlug({
    explicit: data.slug,
    source: data.nameEn,
    fallbackPrefix: "product",
    maxLength: 160,
    exists: async (candidate) => (await db.product.count({ where: { slug: candidate } })) > 0,
  });
  const { categoryIds, slug: _explicitSlug, ...fields } = data;
  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...fields,
          slug,
          status: "DRAFT",
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });
      await refreshProductSearchText(tx, product.id);
      await recordAudit(tx, ctx, {
        action: "catalog.product.create",
        entityType: "product",
        entityId: product.id,
        summary: product.nameEn,
        after: { ...fields, slug, categoryIds, status: "DRAFT" },
      });
      return { id: product.id };
    });
  } catch (error) {
    mapProductConflict(error);
  }
}

export async function updateProduct(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "products.update", "global");
  const data = parseInput(productSchema, input);
  const existing = await db.product.findUnique({
    where: { id },
    include: { categories: { select: { categoryId: true } } },
  });
  if (!existing) throw new NotFoundError("product");
  const existingCategoryIds = existing.categories.map((category) => category.categoryId);
  await assertReferencesUsable(db, data, { ...existing, categoryIds: existingCategoryIds });

  const { categoryIds, slug, ...fields } = data;
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: { ...fields, slug: slug ?? existing.slug } });
      await tx.productCategory.deleteMany({ where: { productId: id, categoryId: { notIn: categoryIds } } });
      const toAdd = categoryIds.filter((categoryId) => !existingCategoryIds.includes(categoryId));
      if (toAdd.length > 0) {
        await tx.productCategory.createMany({
          data: toAdd.map((categoryId) => ({ productId: id, categoryId })),
          skipDuplicates: true,
        });
      }
      await refreshProductSearchText(tx, id);
      const diff = diffForAudit(
        {
          ...existing,
          categoryIds: [...existingCategoryIds].sort(),
          categories: undefined,
          searchText: undefined,
          updatedAt: undefined,
        },
        { ...updated, categoryIds: [...categoryIds].sort(), searchText: undefined, updatedAt: undefined },
      );
      await recordAudit(tx, ctx, {
        action: "catalog.product.update",
        entityType: "product",
        entityId: id,
        summary: updated.nameEn,
        before: diff.before,
        after: diff.after,
      });
    });
  } catch (error) {
    mapProductConflict(error);
  }
}

export async function updateProductContent(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "products.update", "global");
  const data = parseInput(productContentSchema, input);
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("product");
  await db.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id }, data });
    const diff = diffForAudit(existing, updated);
    delete diff.before.updatedAt;
    delete diff.after.updatedAt;
    await recordAudit(tx, ctx, {
      action: "catalog.product.content.update",
      entityType: "product",
      entityId: id,
      summary: updated.nameEn,
      before: diff.before,
      after: diff.after,
    });
  });
}

export async function updateProductNotes(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "products.update", "global");
  const data = parseInput(productNotesSchema, input);
  const existing = await db.product.findUnique({
    where: { id },
    select: { id: true, nameEn: true, notes: { select: { noteId: true, layer: true } } },
  });
  if (!existing) throw new NotFoundError("product");

  const desired = [
    ...data.top.map((noteId, index) => ({ noteId, layer: "TOP" as const, sortOrder: index })),
    ...data.heart.map((noteId, index) => ({ noteId, layer: "HEART" as const, sortOrder: index })),
    ...data.base.map((noteId, index) => ({ noteId, layer: "BASE" as const, sortOrder: index })),
  ];
  const existingIds = new Set(existing.notes.map((note) => note.noteId));
  const newlyUsed = [...new Set(desired.map((note) => note.noteId).filter((noteId) => !existingIds.has(noteId)))];
  if (newlyUsed.length > 0) {
    const notes = await db.fragranceNote.findMany({ where: { id: { in: newlyUsed } }, select: { isActive: true } });
    if (notes.length !== newlyUsed.length) throw new NotFoundError("fragrance_note");
    if (notes.some((note) => !note.isActive))
      throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "fragrance_note" });
  }

  await db.$transaction(async (tx) => {
    await tx.productFragranceNote.deleteMany({ where: { productId: id } });
    if (desired.length > 0) {
      await tx.productFragranceNote.createMany({ data: desired.map((note) => ({ ...note, productId: id })) });
    }
    await tx.product.update({ where: { id }, data: { updatedAt: new Date() } });
    await recordAudit(tx, ctx, {
      action: "catalog.product.notes.update",
      entityType: "product",
      entityId: id,
      summary: existing.nameEn,
      before: { notes: existing.notes },
      after: { notes: desired },
    });
  });
}

/**
 * Status workflow (see lifecycle.ts). Publishing requires at least one ACTIVE
 * variant with an ACTIVE price in an active market, and an active brand.
 */
export async function changeProductStatus(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "products.view");
  const data = parseInput(productStatusChangeSchema, input);
  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, status: true, nameEn: true, publishedAt: true, brand: { select: { isActive: true } } },
  });
  if (!product) throw new NotFoundError("product");
  if (product.status === data.status) return;
  if (!isProductTransitionAllowed(product.status, data.status)) {
    throw new InvalidStateError("errors.invalidState.transition", { from: product.status, to: data.status });
  }
  assertCan(ctx.actor, productTransitionPermission(product.status, data.status), "global");

  await db.$transaction(async (tx) => {
    if (data.status === "PUBLISHED") {
      if (!product.brand.isActive)
        throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "brand" });
      const sellable = await tx.productVariant.count({
        where: { productId: id, status: "ACTIVE", prices: { some: { isActive: true, country: { isActive: true } } } },
      });
      if (sellable === 0) throw new InvalidStateError("errors.invalidState.publishRequirements");
    }
    const now = new Date();
    await tx.product.update({
      where: { id },
      data: {
        status: data.status,
        publishedAt: data.status === "PUBLISHED" ? (product.publishedAt ?? now) : product.publishedAt,
        discontinuedAt: data.status === "DISCONTINUED" ? now : null,
      },
    });
    await recordAudit(tx, ctx, {
      action: "catalog.product.status",
      entityType: "product",
      entityId: id,
      summary: `${product.nameEn}: ${product.status} → ${data.status}`,
      before: { status: product.status },
      after: { status: data.status },
      reason: data.reason,
    });
  });
}
