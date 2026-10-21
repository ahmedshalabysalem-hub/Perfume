import "server-only";
import { activationSchema, categorySchema } from "@/lib/schemas/catalog";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, type DbClient } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan } from "@/server/rbac/authorize";
import { parseInput } from "@/server/validation";
import { resolveSlug } from "./slugs";

const PERMISSION = "catalog.categories.manage" as const;
const MAX_DEPTH = 5;

export type CategoryNode = {
  id: string;
  slug: string;
  parentId: string | null;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder: number;
  isActive: boolean;
  depth: number;
  productCount: number;
};

/** All categories as a depth-first ordered list (parents before children). */
export async function listCategoryTree(ctx: ServiceContext): Promise<CategoryNode[]> {
  assertCan(ctx.actor, "products.view");
  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return flattenTree(rows.map(({ _count, ...row }) => ({ ...row, productCount: _count.products })));
}

export function flattenTree<T extends { id: string; parentId: string | null }>(rows: T[]): Array<T & { depth: number }> {
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const key = row.parentId && rows.some((candidate) => candidate.id === row.parentId) ? row.parentId : null;
    children.set(key, [...(children.get(key) ?? []), row]);
  }
  const output: Array<T & { depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const row of children.get(parentId) ?? []) {
      output.push({ ...row, depth });
      if (depth < 20) visit(row.id, depth + 1);
    }
  };
  visit(null, 0);
  return output;
}

/** Reject parents that would create a cycle or exceed the maximum depth. */
async function assertValidParent(client: DbClient, categoryId: string | null, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (parentId === categoryId) throw new InvalidStateError("errors.invalidState.categoryCycle");
  let depth = 1;
  let cursor: string | null = parentId;
  while (cursor) {
    const parent: { id: string; parentId: string | null } | null = await client.category.findUnique({
      where: { id: cursor },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new NotFoundError("category");
    if (categoryId && parent.id === categoryId) throw new InvalidStateError("errors.invalidState.categoryCycle");
    cursor = parent.parentId;
    depth += 1;
    if (depth > MAX_DEPTH) throw new InvalidStateError("errors.invalidState.categoryCycle");
  }
}

function mapConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "slug")) throw new ConflictError("errors.conflict.slug", { slug: ["errors.conflict.slug"] });
  throw error;
}

export async function createCategory(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, PERMISSION, "global");
  const data = parseInput(categorySchema, input);
  if (data.parentId) {
    const parent = await db.category.findUnique({ where: { id: data.parentId }, select: { isActive: true } });
    if (!parent) throw new NotFoundError("category");
    if (!parent.isActive) throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "category" });
  }
  const { slug } = await resolveSlug({
    explicit: data.slug,
    source: data.nameEn,
    fallbackPrefix: "category",
    exists: async (candidate) => (await db.category.count({ where: { slug: candidate } })) > 0,
  });
  try {
    return await db.$transaction(async (tx) => {
      await assertValidParent(tx, null, data.parentId);
      const category = await tx.category.create({ data: { ...data, slug } });
      await recordAudit(tx, ctx, {
        action: "catalog.category.create",
        entityType: "category",
        entityId: category.id,
        summary: category.nameEn,
        after: category,
      });
      return { id: category.id };
    });
  } catch (error) {
    mapConflict(error);
  }
}

export async function updateCategory(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, PERMISSION, "global");
  const data = parseInput(categorySchema, input);
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("category");
  try {
    await db.$transaction(async (tx) => {
      if (data.parentId !== existing.parentId) await assertValidParent(tx, id, data.parentId);
      const updated = await tx.category.update({ where: { id }, data: { ...data, slug: data.slug ?? existing.slug } });
      const diff = diffForAudit(existing, updated);
      await recordAudit(tx, ctx, {
        action: "catalog.category.update",
        entityType: "category",
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

export async function setCategoryActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, PERMISSION, "global");
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("category");
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.category.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "catalog.category.activate" : "catalog.category.deactivate",
      entityType: "category",
      entityId: id,
      summary: existing.nameEn,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}
