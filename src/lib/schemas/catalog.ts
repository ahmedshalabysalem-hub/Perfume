import { validateBarcode } from "@/lib/barcode";
import { normalizeSku, SKU_PATTERN } from "@/lib/catalog-text";
import { compareDecimalStrings } from "@/lib/money";
import { vmsg, z } from "@/lib/validation/zod";
import {
  booleanField,
  codeField,
  isoCountryCode,
  optionalDate,
  optionalDecimal,
  optionalInt,
  optionalIsoCountryCode,
  optionalLongText,
  optionalMoneyAmount,
  optionalSlug,
  optionalText,
  optionalUrl,
  optionalUuid,
  requiredText,
  sortOrderField,
  uuid,
} from "./fields";

export const PRODUCT_TYPES = [
  "FRAGRANCE",
  "GIFT_SET",
  "BODY_CARE",
  "HOME_FRAGRANCE",
  "ACCESSORY",
  "SAMPLE",
  "OTHER",
] as const;
export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "INACTIVE", "DISCONTINUED"] as const;
export const VARIANT_STATUSES = ["ACTIVE", "INACTIVE", "DISCONTINUED"] as const;
export const AUDIENCES = ["MEN", "WOMEN", "UNISEX"] as const;
export const BARCODE_TYPES = ["EAN_13", "EAN_8", "UPC_A", "GTIN_14", "CODE_128"] as const;
export const BARCODE_SOURCES = ["MANUFACTURER", "INTERNAL"] as const;
export const COMPLIANCE_STATUSES = ["PENDING", "ACTIVE", "EXPIRED", "REJECTED", "NOT_REQUIRED"] as const;

export type ProductStatusValue = (typeof PRODUCT_STATUSES)[number];
export type VariantStatusValue = (typeof VARIANT_STATUSES)[number];

/** Optional enum from a <select> ("" → null). */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? (value as T[number]) : null));

// ─── Reference data ──────────────────────────────────────────────────────────

export const brandSchema = z.object({
  slug: optionalSlug(),
  nameEn: requiredText(120),
  nameAr: requiredText(120),
  descriptionEn: optionalLongText(4000),
  descriptionAr: optionalLongText(4000),
  countryOfOriginCode: optionalIsoCountryCode(),
  websiteUrl: optionalUrl(),
});

export const categorySchema = z.object({
  slug: optionalSlug(),
  parentId: optionalUuid(),
  nameEn: requiredText(120),
  nameAr: requiredText(120),
  descriptionEn: optionalLongText(4000),
  descriptionAr: optionalLongText(4000),
  sortOrder: sortOrderField(),
});

export const fragranceNoteSchema = z.object({
  slug: optionalSlug(),
  nameEn: requiredText(80),
  nameAr: requiredText(80),
});

/** Families and concentrations share one shape. */
export const lookupSchema = z.object({
  code: codeField(40),
  nameEn: requiredText(80),
  nameAr: requiredText(80),
  sortOrder: sortOrderField(),
});

export const activationSchema = z.object({ isActive: z.boolean() });

// ─── Products ────────────────────────────────────────────────────────────────

export const productSchema = z
  .object({
    brandId: uuid(),
    type: z.enum(PRODUCT_TYPES),
    slug: optionalSlug(),
    nameEn: requiredText(200),
    nameAr: requiredText(200),
    shortDescriptionEn: optionalText(400),
    shortDescriptionAr: optionalText(400),
    descriptionEn: optionalLongText(),
    descriptionAr: optionalLongText(),
    audience: optionalEnum(AUDIENCES),
    concentrationId: optionalUuid(),
    fragranceFamilyId: optionalUuid(),
    categoryIds: z.array(uuid()).max(20).default([]),
    primaryCategoryId: optionalUuid(),
    launchYear: optionalInt(1700, 2200, vmsg("year")),
    countryOfOriginCode: optionalIsoCountryCode(),
    manufacturerName: optionalText(200),
  })
  .superRefine((value, context) => {
    if (value.primaryCategoryId && !value.categoryIds.includes(value.primaryCategoryId)) {
      context.addIssue({ code: "custom", path: ["primaryCategoryId"], message: vmsg("primaryCategoryNotSelected") });
    }
    if (new Set(value.categoryIds).size !== value.categoryIds.length) {
      context.addIssue({ code: "custom", path: ["categoryIds"], message: vmsg("invalidOption") });
    }
  });

export const productContentSchema = z.object({
  ingredientsEn: optionalLongText(),
  ingredientsAr: optionalLongText(),
  warningsEn: optionalLongText(4000),
  warningsAr: optionalLongText(4000),
  storageInstructionsEn: optionalLongText(2000),
  storageInstructionsAr: optionalLongText(2000),
  seoTitleEn: optionalText(160),
  seoTitleAr: optionalText(160),
  seoDescriptionEn: optionalText(320),
  seoDescriptionAr: optionalText(320),
});

export const productNotesSchema = z
  .object({
    top: z.array(uuid()).max(15).default([]),
    heart: z.array(uuid()).max(15).default([]),
    base: z.array(uuid()).max(15).default([]),
  })
  .superRefine((value, context) => {
    for (const layer of ["top", "heart", "base"] as const) {
      if (new Set(value[layer]).size !== value[layer].length) {
        context.addIssue({ code: "custom", path: [layer], message: vmsg("duplicateNote") });
      }
    }
  });

export const productStatusChangeSchema = z.object({
  status: z.enum(PRODUCT_STATUSES),
  reason: optionalText(500),
});

// ─── Variants ────────────────────────────────────────────────────────────────

const BARCODE_REASON_KEYS = {
  length: "barcodeLength",
  digits: "barcodeDigits",
  checksum: "barcodeChecksum",
  internalFormat: "barcodeInternalFormat",
  sourceMismatch: "barcodeSourceMismatch",
} as const;

export const variantSchema = z
  .object({
    sku: z
      .string()
      .min(1)
      .max(64)
      .transform(normalizeSku)
      .refine((value) => SKU_PATTERN.test(value), { error: vmsg("skuFormat") }),
    barcode: optionalText(64),
    barcodeType: optionalEnum(BARCODE_TYPES),
    barcodeSource: optionalEnum(BARCODE_SOURCES),
    nameEn: optionalText(120),
    nameAr: optionalText(120),
    sizeMl: optionalDecimal(2, vmsg("sizeMl")),
    weightGrams: optionalInt(1, 100_000),
    isTester: booleanField(),
    trackInventory: booleanField(),
    trackBatches: booleanField(),
    trackExpiry: booleanField(),
    sortOrder: sortOrderField(),
  })
  .superRefine((value, context) => {
    if (!value.barcode) return;
    if (!value.barcodeType || !value.barcodeSource) {
      context.addIssue({ code: "custom", path: ["barcodeType"], message: vmsg("barcodeTypeRequired") });
      return;
    }
    const result = validateBarcode(value.barcode, value.barcodeType, value.barcodeSource);
    if (!result.ok) {
      context.addIssue({ code: "custom", path: ["barcode"], message: vmsg(BARCODE_REASON_KEYS[result.reason]) });
    }
  })
  .transform((value) => {
    const barcode =
      value.barcode && value.barcodeType && value.barcodeSource
        ? validateBarcode(value.barcode, value.barcodeType, value.barcodeSource)
        : null;
    // Expiry tracking needs batches; batches need inventory tracking.
    const trackExpiry = value.trackExpiry;
    const trackBatches = value.trackBatches || trackExpiry;
    const trackInventory = value.trackInventory || trackBatches;
    return {
      ...value,
      barcode: barcode?.ok ? barcode.value : null,
      barcodeType: barcode?.ok ? value.barcodeType : null,
      barcodeSource: barcode?.ok ? value.barcodeSource : null,
      trackInventory,
      trackBatches,
      trackExpiry,
    };
  });

export const variantStatusChangeSchema = z.object({
  status: z.enum(VARIANT_STATUSES),
  reason: optionalText(500),
});

// ─── Prices ──────────────────────────────────────────────────────────────────

export const marketPriceSchema = z
  .object({
    countryCode: isoCountryCode(),
    /** Empty → remove the price for this market (variant not sold there). */
    amount: optionalMoneyAmount(),
    compareAtAmount: optionalMoneyAmount(),
    isActive: booleanField(),
  })
  .superRefine((value, context) => {
    if (!value.amount && value.compareAtAmount) {
      context.addIssue({ code: "custom", path: ["amount"], message: vmsg("required") });
    }
    if (value.amount && value.compareAtAmount && compareDecimalStrings(value.compareAtAmount, value.amount) <= 0) {
      context.addIssue({ code: "custom", path: ["compareAtAmount"], message: vmsg("compareAtGreater") });
    }
  });

export const variantPricesSchema = z
  .object({ prices: z.array(marketPriceSchema).max(20) })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.prices.forEach((price, index) => {
      if (seen.has(price.countryCode)) {
        context.addIssue({ code: "custom", path: ["prices", index, "countryCode"], message: vmsg("invalidOption") });
      }
      seen.add(price.countryCode);
    });
  });

// ─── Compliance ──────────────────────────────────────────────────────────────

export const complianceSchema = z
  .object({
    countryCode: isoCountryCode(),
    authority: requiredText(40),
    referenceType: requiredText(60),
    referenceNumber: optionalText(80),
    status: z.enum(COMPLIANCE_STATUSES),
    issuedAt: optionalDate(),
    expiresAt: optionalDate(),
    notes: optionalLongText(2000),
  })
  .superRefine((value, context) => {
    if (value.issuedAt && value.expiresAt && value.expiresAt < value.issuedAt) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: vmsg("dateOrder") });
    }
  });

// ─── Listing / search parameters ─────────────────────────────────────────────

export const productListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(PRODUCT_STATUSES).optional().catch(undefined),
  brand: z.uuid().optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  type: z.enum(PRODUCT_TYPES).optional().catch(undefined),
  sort: z.enum(["updated", "created", "name"]).default("updated").catch("updated"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type ProductInput = z.input<typeof productSchema>;
export type VariantInput = z.input<typeof variantSchema>;
export type VariantPricesInput = z.input<typeof variantPricesSchema>;
export type ProductListQuery = z.output<typeof productListQuerySchema>;
