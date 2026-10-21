import "server-only";
import { activationSchema, brandSchema } from "@/lib/schemas/catalog";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, type Tx } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan } from "@/server/rbac/authorize";
import { parseInput } from "@/server/validation";
import { refreshProductSearchText } from "./search-document";
import { resolveSlug } from "./slugs";

const PERMISSION = "catalog.brands.manage" as const;

export async function listBrands(ctx: ServiceContext, options: { q?: string; includeInactive?: boolean } = {}) {
  assertCan(ctx.actor, "products.view");
  const q = options.q?.trim();
  return db.brand.findMany({
    where: {
      ...(options.includeInactive === false ? { isActive: true } : {}),
      ...(q
        ? {
            OR: [
              { nameEn: { contains: q, mode: "insensitive" } },
              { nameAr: { contains: q, mode: "insensitive" } },
              { slug: { contains: q.toLowerCase() } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

function mapConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "slug"))
    throw new ConflictError("errors.conflict.slug", { slug: ["errors.conflict.slug"] });
  throw error;
}

export async function createBrand(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, PERMISSION, "global");
  const data = parseInput(brandSchema, input);
  const { slug } = await resolveSlug({
    explicit: data.slug,
    source: data.nameEn,
    fallbackPrefix: "brand",
    exists: async (candidate) => (await db.brand.count({ where: { slug: candidate } })) > 0,
  });
  try {
    return await db.$transaction(async (tx) => {
      const brand = await tx.brand.create({ data: { ...data, slug } });
      await recordAudit(tx, ctx, {
        action: "catalog.brand.create",
        entityType: "brand",
        entityId: brand.id,
        summary: brand.nameEn,
        after: brand,
      });
      return { id: brand.id };
    });
  } catch (error) {
    mapConflict(error);
  }
}

export async function updateBrand(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, PERMISSION, "global");
  const data = parseInput(brandSchema, input);
  const existing = await db.brand.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("brand");
  const slug = data.slug ?? existing.slug;
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.brand.update({ where: { id }, data: { ...data, slug } });
      if (updated.nameEn !== existing.nameEn || updated.nameAr !== existing.nameAr) {
        await refreshBrandProducts(tx, id);
      }
      const diff = diffForAudit(existing, updated);
      await recordAudit(tx, ctx, {
        action: "catalog.brand.update",
        entityType: "brand",
        entityId: id,
        summary: updated.nameEn,
        before: diff.before,
        after: diff.after,
      });
    });
  } catch (error) {
    mapConflict(error);
  }
}

export async function setBrandActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, PERMISSION, "global");
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.brand.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("brand");
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.brand.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "catalog.brand.activate" : "catalog.brand.deactivate",
      entityType: "brand",
      entityId: id,
      summary: existing.nameEn,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}

/** Brand names are part of each product's search document. */
async function refreshBrandProducts(tx: Tx, brandId: string): Promise<void> {
  const products = await tx.product.findMany({ where: { brandId }, select: { id: true } });
  for (const product of products) {
    await refreshProductSearchText(tx, product.id);
  }
}
