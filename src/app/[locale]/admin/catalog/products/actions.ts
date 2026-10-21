"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import {
  addComplianceReference,
  removeComplianceReference,
  updateComplianceReference,
} from "@/server/modules/catalog/compliance.service";
import { makePrimaryImage, removeProductImage, uploadProductImage } from "@/server/modules/catalog/images.service";
import {
  changeProductStatus,
  createProduct,
  updateProduct,
  updateProductContent,
  updateProductNotes,
} from "@/server/modules/catalog/products.service";
import {
  changeVariantStatus,
  createVariant,
  setVariantPrices,
  suggestInternalBarcode,
  updateVariant,
} from "@/server/modules/catalog/variants.service";
import { parseId } from "@/server/validation";

// Products ---------------------------------------------------------------------

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction((ctx) => createProduct(ctx, input));
}

export async function updateProductAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateProduct(ctx, parseId(id, "product"), input);
    refresh();
    return null;
  });
}

export async function updateProductContentAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateProductContent(ctx, parseId(id, "product"), input);
    refresh();
    return null;
  });
}

export async function updateProductNotesAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateProductNotes(ctx, parseId(id, "product"), input);
    refresh();
    return null;
  });
}

export async function changeProductStatusAction(
  id: string,
  status: string,
  reason: string | null,
): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await changeProductStatus(ctx, parseId(id, "product"), { status, reason });
    refresh();
    return null;
  });
}

// Variants & prices ------------------------------------------------------------------

export async function createVariantAction(productId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await createVariant(ctx, parseId(productId, "product"), input);
    refresh();
    return result;
  });
}

export async function updateVariantAction(variantId: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateVariant(ctx, parseId(variantId, "product_variant"), input);
    refresh();
    return null;
  });
}

export async function changeVariantStatusAction(variantId: string, status: string): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await changeVariantStatus(ctx, parseId(variantId, "product_variant"), { status });
    refresh();
    return null;
  });
}

export async function setVariantPricesAction(
  variantId: string,
  input: unknown,
): Promise<ActionResult<{ changed: number }>> {
  return runAction(async (ctx) => {
    const result = await setVariantPrices(ctx, parseId(variantId, "product_variant"), input);
    refresh();
    return result;
  });
}

export async function suggestInternalBarcodeAction(): Promise<ActionResult<string>> {
  return runAction((ctx) => suggestInternalBarcode(ctx));
}

// Images ---------------------------------------------------------------------------------

export async function uploadProductImageAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const file = formData.get("file");
    const result = await uploadProductImage(ctx, parseId(productId, "product"), file instanceof File ? file : null, {
      altEn: formData.get("altEn"),
      altAr: formData.get("altAr"),
    });
    refresh();
    return result;
  });
}

export async function removeProductImageAction(imageId: string): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await removeProductImage(ctx, parseId(imageId, "product_image"));
    refresh();
    return null;
  });
}

export async function makePrimaryImageAction(imageId: string): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await makePrimaryImage(ctx, parseId(imageId, "product_image"));
    refresh();
    return null;
  });
}

// Compliance -----------------------------------------------------------------------------

export async function addComplianceAction(productId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await addComplianceReference(ctx, parseId(productId, "product"), input);
    refresh();
    return result;
  });
}

export async function updateComplianceAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateComplianceReference(ctx, parseId(id, "product_compliance"), input);
    refresh();
    return null;
  });
}

export async function removeComplianceAction(id: string): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await removeComplianceReference(ctx, parseId(id, "product_compliance"));
    refresh();
    return null;
  });
}
