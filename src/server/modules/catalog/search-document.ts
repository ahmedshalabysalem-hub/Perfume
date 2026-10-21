import { buildSearchDocument } from "@/lib/catalog-text";
import type { DbClient } from "@/server/db";

// Pure helper shared by the catalogue services and the seed (no "server-only").

/**
 * Recompute `products.search_text` from the product's names, brand names and
 * variant SKUs/barcodes. Called inside the same transaction as any change to
 * those fields so search never drifts from the data.
 */
export async function refreshProductSearchText(client: DbClient, productId: string): Promise<void> {
  const product = await client.product.findUniqueOrThrow({
    where: { id: productId },
    select: {
      nameEn: true,
      nameAr: true,
      brand: { select: { nameEn: true, nameAr: true } },
      variants: { select: { sku: true, barcode: true, nameEn: true, nameAr: true } },
    },
  });
  const searchText = buildSearchDocument([
    product.nameEn,
    product.nameAr,
    product.brand.nameEn,
    product.brand.nameAr,
    ...product.variants.flatMap((variant) => [variant.sku, variant.barcode, variant.nameEn, variant.nameAr]),
  ]);
  await client.product.update({ where: { id: productId }, data: { searchText } });
}
