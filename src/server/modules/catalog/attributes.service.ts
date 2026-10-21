import "server-only";
import { activationSchema, fragranceNoteSchema, lookupSchema } from "@/lib/schemas/catalog";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan } from "@/server/rbac/authorize";
import { parseInput } from "@/server/validation";
import { resolveSlug } from "./slugs";

/**
 * Fragrance notes, families and concentrations: small, configurable lookup
 * lists managed with `catalog.attributes.manage`.
 */
const PERMISSION = "catalog.attributes.manage" as const;

export type AttributeKind = "note" | "family" | "concentration";

export type AttributeRow = {
  id: string;
  key: string; // slug for notes, code for families/concentrations
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  isActive: boolean;
  usage: number;
};

export async function listAttributes(ctx: ServiceContext, kind: AttributeKind): Promise<AttributeRow[]> {
  assertCan(ctx.actor, "products.view");
  if (kind === "note") {
    const rows = await db.fragranceNote.findMany({
      orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.slug,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      sortOrder: 0,
      isActive: row.isActive,
      usage: row._count.products,
    }));
  }
  const delegate = kind === "family" ? db.fragranceFamily : db.concentration;
  const rows = await (delegate as typeof db.fragranceFamily).findMany({
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    key: row.code,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    usage: row._count.products,
  }));
}

const ENTITY_TYPE: Record<AttributeKind, string> = {
  note: "fragrance_note",
  family: "fragrance_family",
  concentration: "concentration",
};

function conflict(kind: AttributeKind, error: unknown): never {
  if (kind === "note" && isUniqueViolationOn(error, "slug")) {
    throw new ConflictError("errors.conflict.slug", { slug: ["errors.conflict.slug"] });
  }
  if (kind !== "note" && isUniqueViolationOn(error, "code")) {
    throw new ConflictError("errors.conflict.code", { code: ["errors.conflict.code"] });
  }
  throw error;
}

export async function createAttribute(
  ctx: ServiceContext,
  kind: AttributeKind,
  input: unknown,
): Promise<{ id: string }> {
  assertCan(ctx.actor, PERMISSION, "global");
  try {
    if (kind === "note") {
      const data = parseInput(fragranceNoteSchema, input);
      const { slug } = await resolveSlug({
        explicit: data.slug,
        source: data.nameEn,
        fallbackPrefix: "note",
        exists: async (candidate) => (await db.fragranceNote.count({ where: { slug: candidate } })) > 0,
      });
      return await db.$transaction(async (tx) => {
        const row = await tx.fragranceNote.create({ data: { ...data, slug } });
        await recordAudit(tx, ctx, {
          action: "catalog.note.create",
          entityType: ENTITY_TYPE.note,
          entityId: row.id,
          summary: row.nameEn,
          after: row,
        });
        return { id: row.id };
      });
    }
    const data = parseInput(lookupSchema, input);
    return await db.$transaction(async (tx) => {
      const row =
        kind === "family" ? await tx.fragranceFamily.create({ data }) : await tx.concentration.create({ data });
      await recordAudit(tx, ctx, {
        action: `catalog.${kind}.create`,
        entityType: ENTITY_TYPE[kind],
        entityId: row.id,
        summary: row.nameEn,
        after: row,
      });
      return { id: row.id };
    });
  } catch (error) {
    conflict(kind, error);
  }
}

export async function updateAttribute(
  ctx: ServiceContext,
  kind: AttributeKind,
  id: string,
  input: unknown,
): Promise<void> {
  assertCan(ctx.actor, PERMISSION, "global");
  try {
    if (kind === "note") {
      const data = parseInput(fragranceNoteSchema, input);
      const existing = await db.fragranceNote.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("fragrance_note");
      await db.$transaction(async (tx) => {
        const updated = await tx.fragranceNote.update({
          where: { id },
          data: { ...data, slug: data.slug ?? existing.slug },
        });
        const diff = diffForAudit(existing, updated);
        await recordAudit(tx, ctx, {
          action: "catalog.note.update",
          entityType: ENTITY_TYPE.note,
          entityId: id,
          summary: updated.nameEn,
          ...diff,
        });
      });
      return;
    }
    const data = parseInput(lookupSchema, input);
    const existing =
      kind === "family"
        ? await db.fragranceFamily.findUnique({ where: { id } })
        : await db.concentration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(ENTITY_TYPE[kind]);
    await db.$transaction(async (tx) => {
      const updated =
        kind === "family"
          ? await tx.fragranceFamily.update({ where: { id }, data })
          : await tx.concentration.update({ where: { id }, data });
      const diff = diffForAudit(existing, updated);
      await recordAudit(tx, ctx, {
        action: `catalog.${kind}.update`,
        entityType: ENTITY_TYPE[kind],
        entityId: id,
        summary: updated.nameEn,
        ...diff,
      });
    });
  } catch (error) {
    conflict(kind, error);
  }
}

export async function setAttributeActive(
  ctx: ServiceContext,
  kind: AttributeKind,
  id: string,
  input: unknown,
): Promise<void> {
  assertCan(ctx.actor, PERMISSION, "global");
  const { isActive } = parseInput(activationSchema, input);
  await db.$transaction(async (tx) => {
    let name: string;
    if (kind === "note") {
      const existing = await tx.fragranceNote.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(ENTITY_TYPE[kind]);
      if (existing.isActive === isActive) return;
      name = existing.nameEn;
      await tx.fragranceNote.update({ where: { id }, data: { isActive } });
    } else if (kind === "family") {
      const existing = await tx.fragranceFamily.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(ENTITY_TYPE[kind]);
      if (existing.isActive === isActive) return;
      name = existing.nameEn;
      await tx.fragranceFamily.update({ where: { id }, data: { isActive } });
    } else {
      const existing = await tx.concentration.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(ENTITY_TYPE[kind]);
      if (existing.isActive === isActive) return;
      name = existing.nameEn;
      await tx.concentration.update({ where: { id }, data: { isActive } });
    }
    await recordAudit(tx, ctx, {
      action: `catalog.${kind}.${isActive ? "activate" : "deactivate"}`,
      entityType: ENTITY_TYPE[kind],
      entityId: id,
      summary: name,
      before: { isActive: !isActive },
      after: { isActive },
    });
  });
}
