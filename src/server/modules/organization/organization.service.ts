import "server-only";
import { activationSchema } from "@/lib/schemas/catalog";
import {
  countryUpdateSchema,
  legalEntityCreateSchema,
  legalEntityUpdateSchema,
  storeCreateSchema,
  storeUpdateSchema,
  taxNumberLooksValid,
  warehouseCreateSchema,
  warehouseUpdateSchema,
} from "@/lib/schemas/organization";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, type Prisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan, scopeFilterFor } from "@/server/rbac/authorize";
import { scopeFilterIsEmpty } from "@/server/rbac/scope";
import { parseInput } from "@/server/validation";

function codeConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "code")) throw new ConflictError("errors.conflict.code", { code: ["errors.conflict.code"] });
  throw error;
}

function withoutTimestamps<T extends Record<string, unknown>>(value: T) {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = value;
  return rest;
}

// ─── Countries (markets) ─────────────────────────────────────────────────────

export async function listCountries(ctx: ServiceContext) {
  assertCan(ctx.actor, "organization.view");
  return db.country.findMany({ orderBy: { code: "desc" }, include: { currency: true } });
}

/** Market configuration affects every store in the country: GLOBAL scope required. */
export async function updateCountry(ctx: ServiceContext, code: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "organization.manage", "global");
  const data = parseInput(countryUpdateSchema, input);
  const existing = await db.country.findUnique({ where: { code } });
  if (!existing) throw new NotFoundError("country");
  await db.$transaction(async (tx) => {
    const updated = await tx.country.update({ where: { code }, data });
    const diff = diffForAudit(withoutTimestamps(existing), withoutTimestamps(updated));
    await recordAudit(tx, ctx, { action: "organization.country.update", entityType: "country", entityId: code, summary: updated.nameEn, ...diff });
  });
}

// ─── Legal entities ──────────────────────────────────────────────────────────

export async function listLegalEntities(ctx: ServiceContext) {
  const filter = scopeFilterFor(ctx.actor, "organization.view");
  assertCan(ctx.actor, "organization.view");
  const where: Prisma.LegalEntityWhereInput = filter.all
    ? {}
    : scopeFilterIsEmpty(filter)
      ? { id: { in: [] } }
      : {
          OR: [
            { countryCode: { in: filter.countryCodes } },
            { id: { in: filter.legalEntityIds } },
            { stores: { some: { id: { in: filter.storeIds } } } },
            { warehouses: { some: { id: { in: filter.warehouseIds } } } },
          ],
        };
  return db.legalEntity.findMany({
    where,
    orderBy: [{ countryCode: "desc" }, { code: "asc" }],
    include: { country: { select: { nameEn: true, nameAr: true } }, _count: { select: { stores: true, warehouses: true } } },
  });
}

export async function createLegalEntity(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  const data = parseInput(legalEntityCreateSchema, input);
  assertCan(ctx.actor, "organization.manage", { countryCode: data.countryCode });
  const country = await db.country.findUnique({ where: { code: data.countryCode } });
  if (!country) throw new NotFoundError("country");
  try {
    return await db.$transaction(async (tx) => {
      const entity = await tx.legalEntity.create({ data });
      await recordAudit(tx, ctx, { action: "organization.legal_entity.create", entityType: "legal_entity", entityId: entity.id, summary: entity.legalNameEn, after: entity });
      return { id: entity.id };
    });
  } catch (error) {
    codeConflict(error);
  }
}

export async function updateLegalEntity(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const data = parseInput(legalEntityUpdateSchema, input);
  const existing = await db.legalEntity.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("legal_entity");
  assertCan(ctx.actor, "organization.manage", { countryCode: existing.countryCode, legalEntityId: id });
  if (!taxNumberLooksValid(existing.countryCode, data.taxRegistrationNo)) {
    throw new ValidationError({ taxRegistrationNo: ["validation.invalidFormat"] });
  }
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.legalEntity.update({ where: { id }, data });
      const diff = diffForAudit(withoutTimestamps(existing), withoutTimestamps(updated));
      await recordAudit(tx, ctx, { action: "organization.legal_entity.update", entityType: "legal_entity", entityId: id, summary: updated.legalNameEn, ...diff });
    });
  } catch (error) {
    codeConflict(error);
  }
}

export async function setLegalEntityActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.legalEntity.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("legal_entity");
  assertCan(ctx.actor, "organization.manage", { countryCode: existing.countryCode, legalEntityId: id });
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.legalEntity.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "organization.legal_entity.activate" : "organization.legal_entity.deactivate",
      entityType: "legal_entity",
      entityId: id,
      summary: existing.legalNameEn,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}

// ─── Stores ──────────────────────────────────────────────────────────────────

export async function listStores(ctx: ServiceContext) {
  assertCan(ctx.actor, "organization.view");
  const filter = scopeFilterFor(ctx.actor, "organization.view");
  const where: Prisma.StoreWhereInput = filter.all
    ? {}
    : scopeFilterIsEmpty(filter)
      ? { id: { in: [] } }
      : {
          OR: [
            { countryCode: { in: filter.countryCodes } },
            { legalEntityId: { in: filter.legalEntityIds } },
            { id: { in: filter.storeIds } },
          ],
        };
  return db.store.findMany({
    where,
    orderBy: [{ countryCode: "desc" }, { code: "asc" }],
    include: { legalEntity: { select: { code: true, legalNameEn: true, legalNameAr: true } } },
  });
}

async function loadEntityForLocation(ctx: ServiceContext, legalEntityId: string) {
  const entity = await db.legalEntity.findUnique({
    where: { id: legalEntityId },
    include: { country: { select: { code: true, currencyCode: true } } },
  });
  if (!entity) throw new NotFoundError("legal_entity");
  if (!entity.isActive) throw new ValidationError({ legalEntityId: ["validation.invalidReference"] });
  assertCan(ctx.actor, "organization.manage", { countryCode: entity.countryCode, legalEntityId: entity.id });
  return entity;
}

export async function createStore(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, "organization.manage");
  const data = parseInput(storeCreateSchema, input);
  const entity = await loadEntityForLocation(ctx, data.legalEntityId);
  try {
    return await db.$transaction(async (tx) => {
      // Country and currency always follow the legal entity (composite FK).
      const store = await tx.store.create({
        data: { ...data, countryCode: entity.countryCode, currencyCode: entity.country.currencyCode },
      });
      await recordAudit(tx, ctx, { action: "organization.store.create", entityType: "store", entityId: store.id, summary: store.nameEn, after: store });
      return { id: store.id };
    });
  } catch (error) {
    codeConflict(error);
  }
}

export async function updateStore(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const data = parseInput(storeUpdateSchema, input);
  const existing = await db.store.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("store");
  assertCan(ctx.actor, "organization.manage", { countryCode: existing.countryCode, legalEntityId: existing.legalEntityId, storeId: id });
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.store.update({ where: { id }, data });
      const diff = diffForAudit(withoutTimestamps(existing), withoutTimestamps(updated));
      await recordAudit(tx, ctx, { action: "organization.store.update", entityType: "store", entityId: id, summary: updated.nameEn, ...diff });
    });
  } catch (error) {
    codeConflict(error);
  }
}

export async function setStoreActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.store.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("store");
  assertCan(ctx.actor, "organization.manage", { countryCode: existing.countryCode, legalEntityId: existing.legalEntityId, storeId: id });
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.store.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "organization.store.activate" : "organization.store.deactivate",
      entityType: "store",
      entityId: id,
      summary: existing.nameEn,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}

// ─── Warehouses ──────────────────────────────────────────────────────────────

export async function listWarehouses(ctx: ServiceContext) {
  assertCan(ctx.actor, "organization.view");
  const filter = scopeFilterFor(ctx.actor, "organization.view");
  const where: Prisma.WarehouseWhereInput = filter.all
    ? {}
    : scopeFilterIsEmpty(filter)
      ? { id: { in: [] } }
      : {
          OR: [
            { countryCode: { in: filter.countryCodes } },
            { legalEntityId: { in: filter.legalEntityIds } },
            { id: { in: filter.warehouseIds } },
          ],
        };
  return db.warehouse.findMany({
    where,
    orderBy: [{ countryCode: "desc" }, { code: "asc" }],
    include: { legalEntity: { select: { code: true, legalNameEn: true, legalNameAr: true } } },
  });
}

export async function createWarehouse(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, "organization.manage");
  const data = parseInput(warehouseCreateSchema, input);
  const entity = await loadEntityForLocation(ctx, data.legalEntityId);
  try {
    return await db.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({ data: { ...data, countryCode: entity.countryCode } });
      await recordAudit(tx, ctx, { action: "organization.warehouse.create", entityType: "warehouse", entityId: warehouse.id, summary: warehouse.nameEn, after: warehouse });
      return { id: warehouse.id };
    });
  } catch (error) {
    codeConflict(error);
  }
}

export async function updateWarehouse(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const data = parseInput(warehouseUpdateSchema, input);
  const existing = await db.warehouse.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("warehouse");
  assertCan(ctx.actor, "organization.manage", { countryCode: existing.countryCode, legalEntityId: existing.legalEntityId, warehouseId: id });
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.warehouse.update({ where: { id }, data });
      const diff = diffForAudit(withoutTimestamps(existing), withoutTimestamps(updated));
      await recordAudit(tx, ctx, { action: "organization.warehouse.update", entityType: "warehouse", entityId: id, summary: updated.nameEn, ...diff });
    });
  } catch (error) {
    codeConflict(error);
  }
}

export async function setWarehouseActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.warehouse.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("warehouse");
  assertCan(ctx.actor, "organization.manage", { countryCode: existing.countryCode, legalEntityId: existing.legalEntityId, warehouseId: id });
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "organization.warehouse.activate" : "organization.warehouse.deactivate",
      entityType: "warehouse",
      entityId: id,
      summary: existing.nameEn,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}
