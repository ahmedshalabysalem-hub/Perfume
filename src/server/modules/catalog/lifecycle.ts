import type { ProductStatusValue, VariantStatusValue } from "@/lib/schemas/catalog";
import type { PermissionKey } from "@/server/rbac/permissions";

// Pure lifecycle rules (no I/O) — documented in docs/BUSINESS_RULES.md §Catalogue.

/**
 * Allowed product status transitions.
 *  DRAFT        → PUBLISHED | INACTIVE | DISCONTINUED
 *  PUBLISHED    → INACTIVE | DISCONTINUED          (never back to DRAFT)
 *  INACTIVE     → PUBLISHED | DRAFT | DISCONTINUED
 *  DISCONTINUED → INACTIVE                          (reinstatement, deliberate)
 */
const PRODUCT_TRANSITIONS: Record<ProductStatusValue, readonly ProductStatusValue[]> = {
  DRAFT: ["PUBLISHED", "INACTIVE", "DISCONTINUED"],
  PUBLISHED: ["INACTIVE", "DISCONTINUED"],
  INACTIVE: ["PUBLISHED", "DRAFT", "DISCONTINUED"],
  DISCONTINUED: ["INACTIVE"],
};

export function allowedProductTransitions(from: ProductStatusValue): readonly ProductStatusValue[] {
  return PRODUCT_TRANSITIONS[from];
}

export function isProductTransitionAllowed(from: ProductStatusValue, to: ProductStatusValue): boolean {
  return PRODUCT_TRANSITIONS[from].includes(to);
}

/** Changing storefront visibility (into or out of PUBLISHED) needs products.publish. */
export function productTransitionPermission(from: ProductStatusValue, to: ProductStatusValue): PermissionKey {
  return from === "PUBLISHED" || to === "PUBLISHED" ? "products.publish" : "products.update";
}

const VARIANT_TRANSITIONS: Record<VariantStatusValue, readonly VariantStatusValue[]> = {
  ACTIVE: ["INACTIVE", "DISCONTINUED"],
  INACTIVE: ["ACTIVE", "DISCONTINUED"],
  DISCONTINUED: ["INACTIVE"],
};

export function isVariantTransitionAllowed(from: VariantStatusValue, to: VariantStatusValue): boolean {
  return VARIANT_TRANSITIONS[from].includes(to);
}

export function allowedVariantTransitions(from: VariantStatusValue): readonly VariantStatusValue[] {
  return VARIANT_TRANSITIONS[from];
}

/**
 * A variant is sellable in a market only when its product is PUBLISHED, the
 * variant is ACTIVE, the market is active and it has an ACTIVE price there.
 */
export function isSellable(input: {
  productStatus: ProductStatusValue;
  variantStatus: VariantStatusValue;
  marketActive: boolean;
  priceActive: boolean | null;
}): boolean {
  return (
    input.productStatus === "PUBLISHED" &&
    input.variantStatus === "ACTIVE" &&
    input.marketActive &&
    input.priceActive === true
  );
}
