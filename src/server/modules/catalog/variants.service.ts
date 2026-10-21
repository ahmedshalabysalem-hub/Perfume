import "server-only";
import { generateInternalBarcode } from "@/lib/barcode";
import { variantPricesSchema, variantSchema, variantStatusChangeSchema } from "@/lib/schemas/catalog";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db, type DbClient } from "@/server/db";
import { ConflictError, InvalidStateError, NotFoundError } from "@/server/errors";
import { isUniqueViolationOn } from "@/server/prisma-errors";
import { assertCan } from "@/server/rbac/authorize";
import { parseInput } from "@/server/validation";
import { isVariantTransitionAllowed } from "./lifecycle";
import { refreshProductSearchText } from "./search-document";

type VariantData = ReturnType<typeof variantSchema.parse>;

/**
 * Friendly uniqueness checks before writing. The unique indexes on
 * product_variants(sku) and (barcode) remain the source of truth for races;
 * those violations are mapped to the same field errors.
 */
async function assertCodesAvailable(client: DbClient, data: VariantData, excludeVariantId: string | null): Promise<void> {
  const skuOwner = await client.productVariant.findUnique({ where: { sku: data.sku }, select: { id: true } });
  if (skuOwner && skuOwner.id !== excludeVariantId) {
    throw new ConflictError("errors.conflict.sku", { sku: ["errors.conflict.sku"] });
  }
  if (data.barcode) {
    const barcodeOwner = await client.productVariant.findUnique({ where: { barcode: data.barcode }, select: { id: true } });
    if (barcodeOwner && barcodeOwner.id !== excludeVariantId) {
      throw new ConflictError("errors.conflict.barcode", { barcode: ["errors.conflict.barcode"] });
    }
  }
}

function mapVariantConflict(error: unknown): never {
  if (isUniqueViolationOn(error, "sku")) throw new ConflictError("errors.conflict.sku", { sku: ["errors.conflict.sku"] });
  if (isUniqueViolationOn(error, "barcode")) {
    throw new ConflictError("errors.conflict.barcode", { barcode: ["errors.conflict.barcode"] });
  }
  throw error;
}

export async function createVariant(ctx: ServiceContext, productId: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx.actor, "products.update", "global");
  const data = parseInput(variantSchema, input);
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, status: true, nameEn: true } });
  if (!product) throw new NotFoundError("product");
  if (product.status === "DISCONTINUED") throw new InvalidStateError("errors.invalidState.variantProductInactive");
  await assertCodesAvailable(db, data, null);
  try {
    return await db.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({ data: { ...data, productId } });
      await refreshProductSearchText(tx, productId);
      await recordAudit(tx, ctx, {
        action: "catalog.variant.create",
        entityType: "product_variant",
        entityId: variant.id,
        summary: `${product.nameEn} · ${variant.sku}`,
        after: { ...variant, productId },
      });
      return { id: variant.id };
    });
  } catch (error) {
    mapVariantConflict(error);
  }
}

export async function updateVariant(ctx: ServiceContext, variantId: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "products.update", "global");
  const data = parseInput(variantSchema, input);
  const existing = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw new NotFoundError("product_variant");
  await assertCodesAvailable(db, data, variantId);
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({ where: { id: variantId }, data });
      if (updated.sku !== existing.sku || updated.barcode !== existing.barcode || updated.nameEn !== existing.nameEn || updated.nameAr !== existing.nameAr) {
        await refreshProductSearchText(tx, existing.productId);
      }
      const diff = diffForAudit(existing, updated);
      delete diff.before.updatedAt;
      delete diff.after.updatedAt;
      await recordAudit(tx, ctx, {
        action: "catalog.variant.update",
        entityType: "product_variant",
        entityId: variantId,
        summary: updated.sku,
        before: diff.before,
        after: diff.after,
      });
    });
  } catch (error) {
    mapVariantConflict(error);
  }
}

export async function changeVariantStatus(ctx: ServiceContext, variantId: string, input: unknown): Promise<void> {
  assertCan(ctx.actor, "products.update", "global");
  const data = parseInput(variantStatusChangeSchema, input);
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, sku: true, status: true, product: { select: { status: true } } },
  });
  if (!variant) throw new NotFoundError("product_variant");
  if (variant.status === data.status) return;
  if (!isVariantTransitionAllowed(variant.status, data.status)) {
    throw new InvalidStateError("errors.invalidState.transition", { from: variant.status, to: data.status });
  }
  if (data.status === "ACTIVE" && variant.product.status === "DISCONTINUED") {
    throw new InvalidStateError("errors.invalidState.variantProductInactive");
  }
  await db.$transaction(async (tx) => {
    await tx.productVariant.update({ where: { id: variantId }, data: { status: data.status } });
    await recordAudit(tx, ctx, {
      action: "catalog.variant.status",
      entityType: "product_variant",
      entityId: variantId,
      summary: `${variant.sku}: ${variant.status} → ${data.status}`,
      before: { status: variant.status },
      after: { status: data.status },
      reason: data.reason,
    });
  });
}

/** Propose an unused internal Code 128 value (prefix "PF"); not reserved until saved. */
export async function suggestInternalBarcode(ctx: ServiceContext): Promise<string> {
  assertCan(ctx.actor, "products.update", "global");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateInternalBarcode();
    const taken = await db.productVariant.count({ where: { barcode: candidate } });
    if (taken === 0) return candidate;
  }
  throw new Error("Could not generate a unique internal barcode");
}

// ─── Prices ──────────────────────────────────────────────────────────────────

/**
 * Replace a variant's market prices. Only markets whose value actually changes
 * are written, and each changed market requires `products.prices.update` at a
 * scope covering that country — a KSA-scoped manager cannot touch EGP prices.
 * Empty amount = the variant is not sold in that market (price row removed).
 */
export async function setVariantPrices(ctx: ServiceContext, variantId: string, input: unknown): Promise<{ changed: number }> {
  assertCan(ctx.actor, "products.view");
  const data = parseInput(variantPricesSchema, input);
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, sku: true, productId: true, prices: true },
  });
  if (!variant) throw new NotFoundError("product_variant");

  const countries = await db.country.findMany({ where: { code: { in: data.prices.map((price) => price.countryCode) } } });
  const changes: Array<{
    countryCode: string;
    currencyCode: string;
    current: (typeof variant.prices)[number] | undefined;
    desired: { amount: string; compareAtAmount: string | null; isActive: boolean } | null;
  }> = [];

  for (const entry of data.prices) {
    const country = countries.find((candidate) => candidate.code === entry.countryCode);
    if (!country) throw new NotFoundError("country");
    const current = variant.prices.find((price) => price.countryCode === entry.countryCode);
    const desired = entry.amount
      ? { amount: entry.amount, compareAtAmount: entry.compareAtAmount, isActive: entry.isActive }
      : null;
    const unchanged =
      (!current && !desired) ||
      (!!current &&
        !!desired &&
        current.amount.toFixed(2) === desired.amount &&
        (current.compareAtAmount ? current.compareAtAmount.toFixed(2) : null) === desired.compareAtAmount &&
        current.isActive === desired.isActive);
    if (unchanged) continue;
    assertCan(ctx.actor, "products.prices.update", { countryCode: entry.countryCode });
    changes.push({ countryCode: country.code, currencyCode: country.currencyCode, current, desired });
  }
  if (changes.length === 0) return { changed: 0 };

  await db.$transaction(async (tx) => {
    for (const change of changes) {
      if (!change.desired) {
        if (change.current) await tx.productPrice.delete({ where: { id: change.current.id } });
        continue;
      }
      if (change.current) {
        await tx.productPrice.update({
          where: { id: change.current.id },
          data: { amount: change.desired.amount, compareAtAmount: change.desired.compareAtAmount, isActive: change.desired.isActive },
        });
      } else {
        await tx.productPrice.create({
          data: {
            variantId,
            countryCode: change.countryCode,
            // Always the market currency (also enforced by a composite foreign key).
            currencyCode: change.currencyCode,
            amount: change.desired.amount,
            compareAtAmount: change.desired.compareAtAmount,
            isActive: change.desired.isActive,
          },
        });
      }
    }
    await tx.product.update({ where: { id: variant.productId }, data: { updatedAt: new Date() } });
    await recordAudit(tx, ctx, {
      action: "catalog.price.update",
      entityType: "product_variant",
      entityId: variantId,
      summary: `${variant.sku}: ${changes.map((change) => change.countryCode).join(", ")}`,
      before: changes.map((change) => ({
        countryCode: change.countryCode,
        amount: change.current?.amount ?? null,
        compareAtAmount: change.current?.compareAtAmount ?? null,
        isActive: change.current?.isActive ?? null,
      })),
      after: changes.map((change) => ({ countryCode: change.countryCode, currencyCode: change.currencyCode, ...change.desired })),
    });
  });
  return { changed: changes.length };
}
