import "server-only";
import sharp from "sharp";
import { optionalText } from "@/lib/schemas/fields";
import { z } from "@/lib/validation/zod";
import { recordAudit } from "@/server/audit/audit";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { assertCan } from "@/server/rbac/authorize";
import { getStorage } from "@/server/storage/storage";
import { parseInput } from "@/server/validation";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGES_PER_PRODUCT = 12;

const altSchema = z.object({ altEn: optionalText(200), altAr: optionalText(200) });

/**
 * Upload a product image. The file is decoded and re-encoded to WebP by sharp:
 * this rejects anything that is not a real image, strips EXIF/GPS metadata,
 * normalises orientation and bounds dimensions (≤ 2000 px).
 */
export async function uploadProductImage(
  ctx: ServiceContext,
  productId: string,
  file: File | null,
  altInput: unknown,
): Promise<{ id: string }> {
  assertCan(ctx.actor, "products.update", "global-write");
  const alt = parseInput(altSchema, altInput);
  if (!file || file.size === 0) throw new ValidationError({ file: ["images.invalidFile"] });
  if (file.size > MAX_IMAGE_BYTES) throw new ValidationError({ file: ["images.tooLarge"] });
  if (!ALLOWED_TYPES.has(file.type)) throw new ValidationError({ file: ["images.invalidFile"] });

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, nameEn: true, _count: { select: { images: true } } },
  });
  if (!product) throw new NotFoundError("product");
  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) {
    throw new ValidationError({ file: [`validation.tooManyItems|${JSON.stringify({ max: MAX_IMAGES_PER_PRODUCT })}`] });
  }

  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    output = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ValidationError({ file: ["images.invalidFile"] });
  }

  const storageKey = `products/${productId}/${crypto.randomUUID()}.webp`;
  const storage = getStorage();
  await storage.put(storageKey, output.data, "image/webp");
  try {
    return await db.$transaction(async (tx) => {
      const image = await tx.productImage.create({
        data: {
          productId,
          storageKey,
          mimeType: "image/webp",
          sizeBytes: output.info.size,
          width: output.info.width,
          height: output.info.height,
          altEn: alt.altEn,
          altAr: alt.altAr,
          sortOrder: product._count.images,
        },
      });
      await recordAudit(tx, ctx, {
        action: "catalog.image.upload",
        entityType: "product",
        entityId: productId,
        summary: `${product.nameEn}: image added`,
        after: { imageId: image.id, storageKey, width: image.width, height: image.height, sizeBytes: image.sizeBytes },
      });
      return { id: image.id };
    });
  } catch (error) {
    // Do not leave an orphaned file when the database write fails.
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function removeProductImage(ctx: ServiceContext, imageId: string): Promise<void> {
  assertCan(ctx.actor, "products.update", "global-write");
  const image = await db.productImage.findUnique({ where: { id: imageId }, include: { product: { select: { nameEn: true } } } });
  if (!image) throw new NotFoundError("product_image");
  await db.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    await recordAudit(tx, ctx, {
      action: "catalog.image.remove",
      entityType: "product",
      entityId: image.productId,
      summary: `${image.product.nameEn}: image removed`,
      before: { imageId, storageKey: image.storageKey },
    });
  });
  // The file is removed after the row; a failure here leaves an unreferenced
  // file (never a broken reference) and is safe to retry.
  await getStorage().delete(image.storageKey).catch((error) => console.error("[storage] delete failed", error));
}

export async function makePrimaryImage(ctx: ServiceContext, imageId: string): Promise<void> {
  assertCan(ctx.actor, "products.update", "global-write");
  const image = await db.productImage.findUnique({ where: { id: imageId } });
  if (!image) throw new NotFoundError("product_image");
  await db.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({ where: { productId: image.productId }, orderBy: { sortOrder: "asc" } });
    const ordered = [image, ...images.filter((candidate) => candidate.id !== imageId)];
    for (const [index, candidate] of ordered.entries()) {
      if (candidate.sortOrder !== index) {
        await tx.productImage.update({ where: { id: candidate.id }, data: { sortOrder: index } });
      }
    }
    await recordAudit(tx, ctx, {
      action: "catalog.image.primary",
      entityType: "product",
      entityId: image.productId,
      after: { imageId },
    });
  });
}
