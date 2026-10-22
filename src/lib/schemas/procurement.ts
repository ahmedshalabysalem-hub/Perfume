import { normalizeDigits } from "@/lib/digits";
import { vmsg, z } from "@/lib/validation/zod";
import {
  booleanField,
  codeField,
  isoCountryCode,
  optionalEmail,
  optionalInt,
  optionalLongText,
  optionalMoneyAmount,
  optionalText,
  optionalUrl,
  requiredText,
  uuid,
} from "./fields";
import { taxNumberLooksValid } from "./organization";

export const PAYMENT_TERMS = ["PREPAID", "ON_DELIVERY", "NET"] as const;
export type PaymentTermsValue = (typeof PAYMENT_TERMS)[number];

/** Registration numbers: Latin digits, upper-case, no spaces or hyphens. */
const registrationNumber = (max: number) =>
  optionalText(max).transform((value) => (value ? normalizeDigits(value).replace(/[\s-]/g, "").toUpperCase() : null));

const supplierFields = {
  code: codeField(32),
  nameEn: requiredText(200),
  nameAr: requiredText(200),
  supplierCountryCode: isoCountryCode(),
  taxRegistrationNo: registrationNumber(40),
  commercialRegistrationNo: registrationNumber(40),
  paymentTerms: z.enum(PAYMENT_TERMS, { error: vmsg("invalidOption") }),
  paymentTermDays: optionalInt(1, 365),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: vmsg("invalidOption") }),
  email: optionalEmail(),
  phone: optionalText(32),
  websiteUrl: optionalUrl(),
  addressLine1: optionalText(200),
  city: optionalText(100),
  notes: optionalLongText(2000),
};

type SupplierRuleInput = {
  supplierCountryCode: string;
  taxRegistrationNo: string | null;
  paymentTerms: PaymentTermsValue;
  paymentTermDays: number | null;
};

/**
 * Cross-field rules shared by create and update: the tax number format follows
 * the supplier's country (ADR-021) and NET terms need 1–365 days. Days entered
 * for other terms are dropped rather than rejected, since the form hides them.
 */
function refineSupplier<T extends SupplierRuleInput>(value: T, context: z.RefinementCtx): void {
  if (!taxNumberLooksValid(value.supplierCountryCode, value.taxRegistrationNo)) {
    context.addIssue({ code: "custom", path: ["taxRegistrationNo"], message: vmsg("taxNumberFormat") });
  }
  if (value.paymentTerms === "NET" && value.paymentTermDays === null) {
    context.addIssue({ code: "custom", path: ["paymentTermDays"], message: vmsg("paymentTermDays") });
  }
}

function dropUnusedDays<T extends SupplierRuleInput>(value: T): T {
  return value.paymentTerms === "NET" ? value : { ...value, paymentTermDays: null };
}

export const supplierCreateSchema = z
  .object({ ...supplierFields, legalEntityId: uuid() })
  .superRefine(refineSupplier)
  .transform(dropUnusedDays);

/** The buying legal entity (and so the country) is fixed once created. */
export const supplierUpdateSchema = z.object(supplierFields).superRefine(refineSupplier).transform(dropUnusedDays);

export const supplierContactSchema = z.object({
  name: requiredText(120),
  jobTitle: optionalText(120),
  email: optionalEmail(),
  phone: optionalText(32),
  isPrimary: booleanField(),
});

/** Supplier codes are kept as printed but trimmed, upper-cased and with Latin digits. */
const supplierSku = () =>
  requiredText(64).transform((value) => normalizeDigits(value).toUpperCase().replace(/\s+/g, " "));

const supplierProductFields = {
  supplierSku: supplierSku(),
  supplierProductName: optionalText(200),
  /** In the supplier's currency; validated again against its minor units by the service. */
  lastCostAmount: optionalMoneyAmount(2),
};

export const supplierProductCreateSchema = z.object({
  /** Our SKU or barcode — what a scanner types. */
  variantCode: requiredText(64),
  ...supplierProductFields,
});

/** The linked variant is fixed; link another variant instead. */
export const supplierProductUpdateSchema = z.object(supplierProductFields);

export const supplierListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(["active", "inactive"]).optional().catch(undefined),
  entity: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type SupplierListQuery = z.output<typeof supplierListQuerySchema>;
