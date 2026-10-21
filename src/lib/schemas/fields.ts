import { normalizeDigits } from "@/lib/digits";
import { parseMoneyInput } from "@/lib/money";
import { normalizeCode, SLUG_PATTERN } from "@/lib/catalog-text";
import { vmsg, z } from "@/lib/validation/zod";

/**
 * Field builders shared by browser forms and server services. Inputs coming
 * from HTML forms are strings (possibly empty); outputs are typed values.
 */

export const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Empty / missing → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const optionalLongText = (max = 10_000) => optionalText(max);

export const uuid = () => z.uuid({ error: vmsg("invalidReference") });

export const optionalUuid = () =>
  z
    .union([z.uuid({ error: vmsg("invalidReference") }), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null));

/** Slug: optional in forms (generated from the English name when empty). */
export const optionalSlug = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .refine((value) => value === "" || SLUG_PATTERN.test(value), { error: vmsg("slugFormat") })
    .nullish()
    .transform((value) => (value ? value : null));

/** Upper-case reference code (families, concentrations, stores…). */
export const codeField = (max = 40) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform(normalizeCode)
    .refine((value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value), { error: vmsg("codeFormat") });

export const isoCountryCode = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { error: vmsg("countryCode") });

export const optionalIsoCountryCode = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), { error: vmsg("countryCode") })
    .nullish()
    .transform((value) => (value ? value : null));

export const optionalEmail = () =>
  z
    .union([z.email(), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null));

export const optionalUrl = () =>
  z
    .union([z.url({ protocol: /^https?$/ }), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null));

/** Integer from a form string ("", "12", "١٢"). Empty → null. */
export const optionalInt = (min: number, max: number, message = vmsg("integer")) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, context) => {
      if (value === null || value === undefined) return null;
      const text = normalizeDigits(String(value)).trim();
      if (text === "") return null;
      if (!/^-?\d+$/.test(text)) {
        context.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      const number = Number(text);
      if (number < min || number > max) {
        context.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return number;
    });

export const sortOrderField = () => optionalInt(-100_000, 100_000).transform((value) => value ?? 0);

/** Positive decimal with up to `scale` decimals as a canonical string ("7.5" → "7.50"). */
export const optionalDecimal = (scale: number, message: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, context) => {
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      if (text === "") return null;
      const parsed = parseMoneyInput(text, scale);
      if (!parsed.ok || !/[1-9]/.test(parsed.value)) {
        context.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return parsed.value;
    });

/** Validate a money string; reports a specific message descriptor on failure. */
function checkMoney(value: string, minorUnits: number): { ok: true; value: string } | { ok: false; message: string } {
  const parsed = parseMoneyInput(value, minorUnits);
  if (!parsed.ok) {
    const key =
      parsed.reason === "precision" ? "moneyPrecision" : parsed.reason === "range" ? "moneyRange" : "moneyFormat";
    return { ok: false, message: vmsg(key) };
  }
  if (!/[1-9]/.test(parsed.value)) return { ok: false, message: vmsg("moneyPositive") };
  return { ok: true, value: parsed.value };
}

/** Money amount (required) as a canonical decimal string. */
export const moneyAmount = (minorUnits = 2) =>
  z.string().transform((value, context) => {
    const result = checkMoney(value, minorUnits);
    if (!result.ok) {
      context.addIssue({ code: "custom", message: result.message });
      return z.NEVER;
    }
    return result.value;
  });

/** Optional money amount: empty → null (single transform so errors stay specific). */
export const optionalMoneyAmount = (minorUnits = 2) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, context) => {
      if (value === null || value === undefined || value.trim() === "") return null;
      const result = checkMoney(value, minorUnits);
      if (!result.ok) {
        context.addIssue({ code: "custom", message: result.message });
        return z.NEVER;
      }
      return result.value;
    });

export const booleanField = () => z.boolean();

/** Date input (YYYY-MM-DD) → Date at UTC midnight, or null. */
export const optionalDate = () =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, context) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        context.addIssue({ code: "custom", message: vmsg("invalidFormat") });
        return z.NEVER;
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        context.addIssue({ code: "custom", message: vmsg("invalidFormat") });
        return z.NEVER;
      }
      return date;
    });

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneField = () =>
  z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, { error: vmsg("timezone") });
