import "server-only";
import { complianceSchema } from "@/lib/schemas/catalog";
import { recordAudit } from "@/server/audit/audit";
import { diffForAudit } from "@/server/audit/redact";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { assertCan } from "@/server/rbac/authorize";
import { parseInput } from "@/server/validation";

/**
 * Country-specific regulatory references (e.g. a cosmetics notification
 * number). Managing them requires `products.compliance.manage` at a scope
 * that covers the reference's country.
 */
export async function addComplianceReference(ctx: ServiceContext, productId: string, input: unknown): Promise<{ id: string }> {
  const data = parseInput(complianceSchema, input);
  assertCan(ctx.actor, "products.compliance.manage", { countryCode: data.countryCode });
  const product = await db.product.findUnique({ where: { id: productId }, select: { nameEn: true } });
  if (!product) throw new NotFoundError("product");
  const country = await db.country.findUnique({ where: { code: data.countryCode }, select: { code: true } });
  if (!country) throw new NotFoundError("country");
  return db.$transaction(async (tx) => {
    const row = await tx.productCompliance.create({ data: { ...data, productId } });
    await recordAudit(tx, ctx, {
      action: "catalog.compliance.create",
      entityType: "product",
      entityId: productId,
      summary: `${product.nameEn}: ${data.authority} ${data.referenceType}`,
      after: row,
    });
    return { id: row.id };
  });
}

export async function updateComplianceReference(ctx: ServiceContext, id: string, input: unknown): Promise<void> {
  const data = parseInput(complianceSchema, input);
  const existing = await db.productCompliance.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("product_compliance");
  assertCan(ctx.actor, "products.compliance.manage", { countryCode: existing.countryCode });
  assertCan(ctx.actor, "products.compliance.manage", { countryCode: data.countryCode });
  await db.$transaction(async (tx) => {
    const updated = await tx.productCompliance.update({ where: { id }, data });
    const diff = diffForAudit(existing, updated);
    delete diff.before.updatedAt;
    delete diff.after.updatedAt;
    await recordAudit(tx, ctx, {
      action: "catalog.compliance.update",
      entityType: "product",
      entityId: existing.productId,
      summary: `${updated.authority} ${updated.referenceType}`,
      before: diff.before,
      after: diff.after,
    });
  });
}

export async function removeComplianceReference(ctx: ServiceContext, id: string): Promise<void> {
  const existing = await db.productCompliance.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("product_compliance");
  assertCan(ctx.actor, "products.compliance.manage", { countryCode: existing.countryCode });
  await db.$transaction(async (tx) => {
    await tx.productCompliance.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: "catalog.compliance.remove",
      entityType: "product",
      entityId: existing.productId,
      summary: `${existing.authority} ${existing.referenceType}`,
      before: existing,
    });
  });
}
