import "server-only";
import { parseMoneyInput } from "@/lib/money";
import { activationSchema } from "@/lib/schemas/catalog";
import {
  supplierContactSchema,
  supplierCreateSchema,
  supplierListQuerySchema,
  supplierProductCreateSchema,
  supplierProductUpdateSchema,
  supplierUpdateSchema,
  type SupplierListQuery,
} from "@/lib/schemas/procurement";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, type DbClient, type Prisma, type Tx } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from "@/server/errors";
import { findVariantByCode } from "@/server/modules/catalog/products.service";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan, scopeFilterFor } from "@/server/rbac/authorize";
import { scopeFilterIsEmpty, type ResourceScope } from "@/server/rbac/scope";
import { parseInput } from "@/server/validation";

/**
 * Suppliers belong to a buying legal entity (ADR-021). Reads need
 * `suppliers.view` and writes `suppliers.manage`, both at a scope covering the
 * supplier's legal entity or country.
 */

export const SUPPLIER_PAGE_SIZE = 20;

function supplierScope(supplier: { countryCode: string; legalEntityId: string }): ResourceScope {
  return { countryCode: supplier.countryCode, legalEntityId: supplier.legalEntityId };
}

function withoutTimestamps<T extends Record<string, unknown>>(value: T) {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = value;
  return rest;
}

function supplierConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "taxRegistrationNo"))
    throw new ConflictError("errors.conflict.taxNumber", { taxRegistrationNo: ["errors.conflict.taxNumber"] });
  if (isUniqueViolationOn(error, "code"))
    throw new ConflictError("errors.conflict.code", { code: ["errors.conflict.code"] });
  throw error;
}

function supplierProductConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "variantId"))
    throw new ConflictError("errors.conflict.supplierVariant", { variantCode: ["errors.conflict.supplierVariant"] });
  if (isUniqueViolationOn(error, "supplierSku"))
    throw new ConflictError("errors.conflict.supplierSku", { supplierSku: ["errors.conflict.supplierSku"] });
  throw error;
}

async function loadActiveCurrency(client: DbClient, code: string) {
  const currency = await client.currency.findUnique({ where: { code } });
  if (!currency) throw new ValidationError({ currencyCode: ["validation.invalidOption"] });
  if (!currency.isActive) throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "currency" });
  return currency;
}

/** Serialises changes to a supplier's children (primary contact). */
async function lockSupplier(tx: Tx, id: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "suppliers" WHERE "id" = ${id}::uuid FOR UPDATE`;
}

// ─── Listing & lookup ────────────────────────────────────────────────────────

export async function listSuppliers(ctx: ServiceContext, rawQuery: unknown) {
  assertCan(ctx.actor, "suppliers.view");
  const query: SupplierListQuery = supplierListQuerySchema.parse(rawQuery ?? {});
  const filter = scopeFilterFor(ctx.actor, "suppliers.view");
  const scopeWhere: Prisma.SupplierWhereInput = filter.all
    ? {}
    : scopeFilterIsEmpty(filter)
      ? { id: { in: [] } }
      : { OR: [{ countryCode: { in: filter.countryCodes } }, { legalEntityId: { in: filter.legalEntityIds } }] };
  const q = query.q;
  const where: Prisma.SupplierWhereInput = {
    AND: [
      scopeWhere,
      q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { nameEn: { contains: q, mode: "insensitive" } },
              { nameAr: { contains: q, mode: "insensitive" } },
              { taxRegistrationNo: { contains: q.replace(/[\s-]/g, ""), mode: "insensitive" } },
            ],
          }
        : {},
      query.status ? { isActive: query.status === "active" } : {},
      query.entity ? { legalEntityId: query.entity } : {},
    ],
  };
  const total = await db.supplier.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / SUPPLIER_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const rows = await db.supplier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    skip: (page - 1) * SUPPLIER_PAGE_SIZE,
    take: SUPPLIER_PAGE_SIZE,
    include: {
      legalEntity: { select: { code: true, legalNameEn: true, legalNameAr: true } },
      contacts: { where: { isPrimary: true }, select: { name: true, email: true, phone: true }, take: 1 },
      _count: { select: { products: { where: { isActive: true } } } },
    },
  });
  return { rows, total, page, pageCount, query: { ...query, page } };
}

/** Legal entities in which the actor may create suppliers. */
export async function supplierEntityOptions(ctx: ServiceContext) {
  assertCan(ctx.actor, "suppliers.view");
  const filter = scopeFilterFor(ctx.actor, "suppliers.manage");
  if (!filter.all && scopeFilterIsEmpty(filter)) return [];
  const entities = await db.legalEntity.findMany({
    where: {
      isActive: true,
      ...(filter.all
        ? {}
        : { OR: [{ countryCode: { in: filter.countryCodes } }, { id: { in: filter.legalEntityIds } }] }),
    },
    orderBy: [{ countryCode: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      countryCode: true,
      legalNameEn: true,
      legalNameAr: true,
      country: { select: { currencyCode: true } },
    },
  });
  return entities.map(({ country, ...entity }) => ({ ...entity, currencyCode: country.currencyCode }));
}

export async function listActiveCurrencies() {
  return db.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
}

export async function getSupplier(ctx: ServiceContext, id: string) {
  assertCan(ctx.actor, "suppliers.view");
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      legalEntity: { select: { code: true, legalNameEn: true, legalNameAr: true } },
      currency: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      products: {
        orderBy: [{ isActive: "desc" }, { supplierSku: "asc" }],
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              barcode: true,
              nameEn: true,
              nameAr: true,
              sizeMl: true,
              status: true,
              product: { select: { id: true, nameEn: true, nameAr: true } },
            },
          },
        },
      },
    },
  });
  if (!supplier) throw new NotFoundError("supplier");
  assertCan(ctx.actor, "suppliers.view", supplierScope(supplier));
  return supplier;
}

/** Change history of a supplier, its contacts and supplier products (no IPs or user agents). */
export async function getSupplierHistory(ctx: ServiceContext, id: string) {
  const supplier = await db.supplier.findUnique({ where: { id }, select: { countryCode: true, legalEntityId: true } });
  if (!supplier) throw new NotFoundError("supplier");
  assertCan(ctx.actor, "suppliers.view", supplierScope(supplier));
  const entries = await db.auditLog.findMany({
    where: { entityType: "supplier", entityId: id },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  const actorIds = [...new Set(entries.map((entry) => entry.actorUserId).filter((value): value is string => !!value))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  return entries.map((entry) => ({
    id: entry.id,
    occurredAt: entry.occurredAt,
    action: entry.action,
    summary: entry.summary,
    actorName: entry.actorUserId ? (names.get(entry.actorUserId) ?? null) : null,
  }));
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function createSupplier(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  const data = parseInput(supplierCreateSchema, input);
  const entity = await db.legalEntity.findUnique({ where: { id: data.legalEntityId } });
  if (!entity) throw new ValidationError({ legalEntityId: ["validation.invalidReference"] });
  assertCan(ctx.actor, "suppliers.manage", { countryCode: entity.countryCode, legalEntityId: entity.id });
  if (!entity.isActive)
    throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "legal_entity" });
  await loadActiveCurrency(db, data.currencyCode);
  try {
    return await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: { ...data, countryCode: entity.countryCode } });
      await recordAudit(tx, ctx, {
        action: "procurement.supplier.create",
        entityType: "supplier",
        entityId: supplier.id,
        summary: `${supplier.code} · ${supplier.nameEn}`,
        after: withoutTimestamps(supplier),
      });
      return { id: supplier.id };
    });
  } catch (error) {
    supplierConflict(error);
  }
}

export async function updateSupplier(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const data = parseInput(supplierUpdateSchema, input);
  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("supplier");
  assertCan(ctx.actor, "suppliers.manage", supplierScope(existing));
  if (data.currencyCode !== existing.currencyCode) await loadActiveCurrency(db, data.currencyCode);
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.supplier.update({ where: { id }, data });
      const diff = diffForAudit(withoutTimestamps(existing), withoutTimestamps(updated));
      if (Object.keys(diff.after).length === 0) return;
      await recordAudit(tx, ctx, {
        action: "procurement.supplier.update",
        entityType: "supplier",
        entityId: id,
        summary: `${updated.code} · ${updated.nameEn}`,
        ...diff,
      });
    });
  } catch (error) {
    supplierConflict(error);
  }
}

export async function setSupplierActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("supplier");
  assertCan(ctx.actor, "suppliers.manage", supplierScope(existing));
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "procurement.supplier.activate" : "procurement.supplier.deactivate",
      entityType: "supplier",
      entityId: id,
      summary: `${existing.code} · ${existing.nameEn}`,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}

// ─── Contacts ────────────────────────────────────────────────────────────────

/**
 * Contacts are personal data: audit entries keep the name, job title and
 * which fields changed, never the e-mail address or phone number (ADR-021).
 */
function contactAuditSnapshot(contact: { name: string; jobTitle: string | null; isPrimary: boolean }) {
  return { name: contact.name, jobTitle: contact.jobTitle, isPrimary: contact.isPrimary };
}

async function loadSupplierForManage(ctx: ServiceContext, supplierId: string) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new NotFoundError("supplier");
  assertCan(ctx.actor, "suppliers.manage", supplierScope(supplier));
  return supplier;
}

export async function addSupplierContact(
  ctx: ServiceContext,
  supplierId: string,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseInput(supplierContactSchema, input);
  const supplier = await loadSupplierForManage(ctx, supplierId);
  return db.$transaction(async (tx) => {
    await lockSupplier(tx, supplierId);
    // The first contact is the primary one.
    const isPrimary = data.isPrimary || (await tx.supplierContact.count({ where: { supplierId } })) === 0;
    if (isPrimary) await tx.supplierContact.updateMany({ where: { supplierId }, data: { isPrimary: false } });
    const contact = await tx.supplierContact.create({ data: { ...data, isPrimary, supplierId } });
    await recordAudit(tx, ctx, {
      action: "procurement.supplier_contact.create",
      entityType: "supplier",
      entityId: supplierId,
      summary: `${supplier.code}: ${contact.name}`,
      after: contactAuditSnapshot(contact),
    });
    return { id: contact.id };
  });
}

export async function updateSupplierContact(ctx: ServiceContext, contactId: string, input: unknown): Promise<void> {
  const data = parseInput(supplierContactSchema, input);
  const existing = await db.supplierContact.findUnique({ where: { id: contactId } });
  if (!existing) throw new NotFoundError("supplier_contact");
  const supplier = await loadSupplierForManage(ctx, existing.supplierId);
  await db.$transaction(async (tx) => {
    await lockSupplier(tx, supplier.id);
    if (data.isPrimary && !existing.isPrimary) {
      await tx.supplierContact.updateMany({ where: { supplierId: supplier.id }, data: { isPrimary: false } });
    }
    const updated = await tx.supplierContact.update({ where: { id: contactId }, data });
    const changedFields = (["name", "jobTitle", "email", "phone", "isPrimary"] as const).filter(
      (field) => existing[field] !== updated[field],
    );
    if (changedFields.length === 0) return;
    await recordAudit(tx, ctx, {
      action: "procurement.supplier_contact.update",
      entityType: "supplier",
      entityId: supplier.id,
      summary: `${supplier.code}: ${updated.name}`,
      before: contactAuditSnapshot(existing),
      after: { ...contactAuditSnapshot(updated), changedFields },
    });
  });
}

export async function removeSupplierContact(ctx: ServiceContext, contactId: string): Promise<void> {
  const existing = await db.supplierContact.findUnique({ where: { id: contactId } });
  if (!existing) throw new NotFoundError("supplier_contact");
  const supplier = await loadSupplierForManage(ctx, existing.supplierId);
  await db.$transaction(async (tx) => {
    await lockSupplier(tx, supplier.id);
    await tx.supplierContact.delete({ where: { id: contactId } });
    await recordAudit(tx, ctx, {
      action: "procurement.supplier_contact.remove",
      entityType: "supplier",
      entityId: supplier.id,
      summary: `${supplier.code}: ${existing.name}`,
      before: contactAuditSnapshot(existing),
    });
  });
}

// ─── Supplier products ───────────────────────────────────────────────────────

/** Re-check the cost against the supplier currency's minor units (≤ the column's 2). */
function checkCostPrecision(amount: string | null, minorUnits: number): void {
  if (amount === null) return;
  if (!parseMoneyInput(amount, Math.min(minorUnits, 2)).ok) {
    throw new ValidationError({ lastCostAmount: ["validation.moneyPrecision"] });
  }
}

function serializeSupplierProduct(row: {
  supplierSku: string;
  supplierProductName: string | null;
  lastCostAmount: Prisma.Decimal | null;
  lastCostCurrency: string | null;
  isActive: boolean;
}) {
  return {
    supplierSku: row.supplierSku,
    supplierProductName: row.supplierProductName,
    lastCostAmount: row.lastCostAmount?.toFixed(2) ?? null,
    lastCostCurrency: row.lastCostCurrency,
    isActive: row.isActive,
  };
}

export async function addSupplierProduct(
  ctx: ServiceContext,
  supplierId: string,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseInput(supplierProductCreateSchema, input);
  const supplier = await loadSupplierForManage(ctx, supplierId);
  if (!supplier.isActive) throw new InvalidStateError("errors.invalidState.inactiveReference", { entity: "supplier" });
  const variant = await findVariantByCode(db, data.variantCode);
  if (!variant) throw new ValidationError({ variantCode: ["validation.variantNotFound"] });
  const currency = await loadActiveCurrency(db, supplier.currencyCode);
  checkCostPrecision(data.lastCostAmount, currency.minorUnits);
  const { variantCode: _variantCode, ...fields } = data;
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.supplierProduct.create({
        data: {
          ...fields,
          supplierId,
          variantId: variant.id,
          ...(fields.lastCostAmount
            ? { lastCostCurrency: supplier.currencyCode, lastCostAt: new Date() }
            : { lastCostCurrency: null, lastCostAt: null }),
        },
      });
      await recordAudit(tx, ctx, {
        action: "procurement.supplier_product.create",
        entityType: "supplier",
        entityId: supplierId,
        summary: `${supplier.code}: ${variant.sku} → ${row.supplierSku}`,
        after: { variantId: variant.id, sku: variant.sku, ...serializeSupplierProduct(row) },
      });
      return { id: row.id };
    });
  } catch (error) {
    supplierProductConflict(error);
  }
}

export async function updateSupplierProduct(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const data = parseInput(supplierProductUpdateSchema, input);
  const existing = await db.supplierProduct.findUnique({
    where: { id },
    include: { variant: { select: { sku: true } } },
  });
  if (!existing) throw new NotFoundError("supplier_product");
  const supplier = await loadSupplierForManage(ctx, existing.supplierId);
  // A new amount is recorded in the supplier's current currency and dated now;
  // an unchanged amount keeps its original currency and date (never relabelled).
  const costChanged = (existing.lastCostAmount?.toFixed(2) ?? null) !== data.lastCostAmount;
  if (costChanged && data.lastCostAmount !== null) {
    const currency = await loadActiveCurrency(db, supplier.currencyCode);
    checkCostPrecision(data.lastCostAmount, currency.minorUnits);
  }
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.supplierProduct.update({
        where: { id },
        data: {
          supplierSku: data.supplierSku,
          supplierProductName: data.supplierProductName,
          ...(costChanged
            ? data.lastCostAmount === null
              ? { lastCostAmount: null, lastCostCurrency: null, lastCostAt: null }
              : { lastCostAmount: data.lastCostAmount, lastCostCurrency: supplier.currencyCode, lastCostAt: new Date() }
            : {}),
        },
      });
      const diff = diffForAudit(serializeSupplierProduct(existing), serializeSupplierProduct(updated));
      if (Object.keys(diff.after).length === 0) return;
      await recordAudit(tx, ctx, {
        action: "procurement.supplier_product.update",
        entityType: "supplier",
        entityId: supplier.id,
        summary: `${supplier.code}: ${existing.variant.sku} → ${updated.supplierSku}`,
        ...diff,
      });
    });
  } catch (error) {
    supplierProductConflict(error);
  }
}

export async function setSupplierProductActive(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const { isActive } = parseInput(activationSchema, input);
  const existing = await db.supplierProduct.findUnique({
    where: { id },
    include: { variant: { select: { sku: true } } },
  });
  if (!existing) throw new NotFoundError("supplier_product");
  const supplier = await loadSupplierForManage(ctx, existing.supplierId);
  if (existing.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.supplierProduct.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, ctx, {
      action: isActive ? "procurement.supplier_product.activate" : "procurement.supplier_product.deactivate",
      entityType: "supplier",
      entityId: supplier.id,
      summary: `${supplier.code}: ${existing.variant.sku} → ${existing.supplierSku}`,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
  });
}
