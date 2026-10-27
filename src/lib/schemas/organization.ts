import { normalizeDigits } from "@/lib/digits";
import { vmsg, z } from "@/lib/validation/zod";
import {
  booleanField,
  codeField,
  isoCountryCode,
  optionalEmail,
  optionalText,
  optionalUuid,
  requiredText,
  timeZoneField,
  uuid,
} from "./fields";

export const STORE_TYPES = ["ONLINE", "RETAIL"] as const;

const optionalDigits = (max: number) =>
  optionalText(max).transform((value) => (value ? normalizeDigits(value).replace(/[\s-]/g, "") : null));

export const countryUpdateSchema = z.object({
  nameEn: requiredText(80),
  nameAr: requiredText(80),
  timezone: timeZoneField(),
  defaultLocale: z.enum(["ar", "en"]),
  pricesIncludeTax: booleanField(),
  isActive: booleanField(),
});

const legalEntityFields = {
  legalNameEn: requiredText(200),
  legalNameAr: requiredText(200),
  tradeNameEn: optionalText(200),
  tradeNameAr: optionalText(200),
  commercialRegistrationNo: optionalDigits(40),
  taxRegistrationNo: optionalDigits(40),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  district: optionalText(100),
  postalCode: optionalText(20),
  buildingNumber: optionalText(20),
  email: optionalEmail(),
  phone: optionalText(32),
};

/**
 * Light format checks for tax registration numbers. KSA VAT numbers are 15
 * digits starting and ending with 3; Egyptian tax registration numbers are
 * 9 digits. Both rules are pending confirmation (docs/COUNTRY_COMPLIANCE.md).
 */
export function taxNumberLooksValid(countryCode: string, value: string | null): boolean {
  if (!value) return true;
  if (countryCode === "SA") return /^3\d{13}3$/.test(value);
  if (countryCode === "EG") return /^\d{9}$/.test(value);
  return /^[A-Z0-9]{4,40}$/i.test(value);
}

export const legalEntityCreateSchema = z
  .object({ code: codeField(32), countryCode: isoCountryCode(), ...legalEntityFields })
  .superRefine((value, context) => {
    if (!taxNumberLooksValid(value.countryCode, value.taxRegistrationNo)) {
      context.addIssue({ code: "custom", path: ["taxRegistrationNo"], message: vmsg("invalidFormat") });
    }
  });

/** Country is fixed once created (stores, warehouses and documents depend on it). */
export const legalEntityUpdateSchema = z.object({ code: codeField(32), ...legalEntityFields });

const locationFields = {
  code: codeField(32),
  nameEn: requiredText(120),
  nameAr: requiredText(120),
  timezone: timeZoneField(),
  addressLine1: optionalText(200),
  city: optionalText(100),
};

export const storeCreateSchema = z.object({
  ...locationFields,
  legalEntityId: uuid(),
  type: z.enum(STORE_TYPES),
  phone: optionalText(32),
  email: optionalEmail(),
  /** Warehouse of the same legal entity that ships this store's online orders (ADR-025). */
  fulfilmentWarehouseId: optionalUuid(),
});

/** A store's legal entity (and therefore country/currency) is fixed once created. */
export const storeUpdateSchema = storeCreateSchema.omit({ legalEntityId: true });

export const warehouseCreateSchema = z.object({ ...locationFields, legalEntityId: uuid() });
export const warehouseUpdateSchema = warehouseCreateSchema.omit({ legalEntityId: true });
