import { normalizeDigits } from "@/lib/digits";
import { vmsg, z } from "@/lib/validation/zod";

/**
 * Cart and guest checkout (ORD-001, ADR-025). Shared by the browser and the
 * server; the server re-validates everything and never trusts prices, totals,
 * the company or availability coming from the browser — a cart line is only
 * a variant id and a quantity.
 */

export const CART_MAX_LINES = 20;
export const CART_MAX_QUANTITY = 10;

export const cartLineSchema = z.object({
  variantId: z.uuid({ error: vmsg("invalidReference") }),
  quantity: z
    .number({ error: vmsg("quantityRange", { max: CART_MAX_QUANTITY }) })
    .int({ error: vmsg("quantityRange", { max: CART_MAX_QUANTITY }) })
    .min(1, { error: vmsg("quantityRange", { max: CART_MAX_QUANTITY }) })
    .max(CART_MAX_QUANTITY, { error: vmsg("quantityRange", { max: CART_MAX_QUANTITY }) }),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;

export const cartLinesSchema = z
  .array(cartLineSchema)
  .min(1)
  .max(CART_MAX_LINES)
  .refine((lines) => new Set(lines.map((line) => line.variantId)).size === lines.length, {
    error: vmsg("duplicateLine"),
  });

// ─── Phone numbers ──────────────────────────────────────────────────────────

/**
 * Normalise a mobile number of the store's country to E.164, or null when it
 * is not a valid mobile number there. Accepts local ("0512345678"),
 * international ("+966 51 234 5678", "00966…") and Arabic-Indic digits.
 */
export function normalizeMobile(countryCode: string, raw: string): string | null {
  let digits = normalizeDigits(raw).replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (countryCode === "SA") {
    if (digits.startsWith("966")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    return /^5\d{8}$/.test(digits) ? `+966${digits}` : null;
  }
  if (countryCode === "EG") {
    if (digits.startsWith("20") && digits.length === 12) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    return /^1[0125]\d{8}$/.test(digits) ? `+20${digits}` : null;
  }
  return null;
}

// ─── Delivery address per country ───────────────────────────────────────────

/** Egyptian governorates (ISO 3166-2:EG codes). */
export const EG_GOVERNORATES = [
  { code: "C", en: "Cairo", ar: "القاهرة" },
  { code: "GZ", en: "Giza", ar: "الجيزة" },
  { code: "ALX", en: "Alexandria", ar: "الإسكندرية" },
  { code: "KB", en: "Qalyubia", ar: "القليوبية" },
  { code: "DK", en: "Dakahlia", ar: "الدقهلية" },
  { code: "SHR", en: "Sharqia", ar: "الشرقية" },
  { code: "GH", en: "Gharbia", ar: "الغربية" },
  { code: "MNF", en: "Monufia", ar: "المنوفية" },
  { code: "BH", en: "Beheira", ar: "البحيرة" },
  { code: "KFS", en: "Kafr El Sheikh", ar: "كفر الشيخ" },
  { code: "DT", en: "Damietta", ar: "دمياط" },
  { code: "PTS", en: "Port Said", ar: "بورسعيد" },
  { code: "IS", en: "Ismailia", ar: "الإسماعيلية" },
  { code: "SUZ", en: "Suez", ar: "السويس" },
  { code: "FYM", en: "Faiyum", ar: "الفيوم" },
  { code: "BNS", en: "Beni Suef", ar: "بني سويف" },
  { code: "MN", en: "Minya", ar: "المنيا" },
  { code: "AST", en: "Asyut", ar: "أسيوط" },
  { code: "SHG", en: "Sohag", ar: "سوهاج" },
  { code: "KN", en: "Qena", ar: "قنا" },
  { code: "LX", en: "Luxor", ar: "الأقصر" },
  { code: "ASN", en: "Aswan", ar: "أسوان" },
  { code: "BA", en: "Red Sea", ar: "البحر الأحمر" },
  { code: "WAD", en: "New Valley", ar: "الوادي الجديد" },
  { code: "MT", en: "Matrouh", ar: "مطروح" },
  { code: "SIN", en: "North Sinai", ar: "شمال سيناء" },
  { code: "JS", en: "South Sinai", ar: "جنوب سيناء" },
] as const;

export type AddressField =
  "region" | "city" | "district" | "street" | "buildingNumber" | "unit" | "postalCode" | "shortAddress" | "additional";

type FieldRule = "required" | "optional" | "hidden";

/**
 * Which address fields each delivery country asks for. Change a rule here to
 * make a field required or optional; the form and the server both follow it.
 */
export const ADDRESS_FIELDS: Record<string, Record<AddressField, FieldRule>> = {
  SA: {
    region: "hidden",
    city: "required",
    district: "required",
    street: "required",
    buildingNumber: "optional",
    unit: "optional",
    postalCode: "optional",
    shortAddress: "optional",
    additional: "optional",
  },
  EG: {
    region: "required",
    city: "required",
    district: "optional",
    street: "required",
    buildingNumber: "optional",
    unit: "optional",
    postalCode: "optional",
    shortAddress: "hidden",
    additional: "optional",
  },
};

/** Countries the storefront delivers to (each store delivers in its own country). */
export function deliversTo(countryCode: string): boolean {
  return countryCode in ADDRESS_FIELDS;
}

const FIELD_MAX: Record<AddressField, number> = {
  region: 40,
  city: 100,
  district: 100,
  street: 200,
  buildingNumber: 20,
  unit: 40,
  postalCode: 10,
  shortAddress: 8,
  additional: 200,
};

const text = z.string().max(1000).optional().default("");

export const checkoutFormSchema = z.object({
  name: text,
  phone: text,
  email: text,
  region: text,
  city: text,
  district: text,
  street: text,
  buildingNumber: text,
  unit: text,
  postalCode: text,
  shortAddress: text,
  additional: text,
  deliveryNotes: text,
});

export type CheckoutFormInput = z.input<typeof checkoutFormSchema>;

export type CheckoutDetails = {
  name: string;
  phone: string;
  email: string | null;
  address: Record<AddressField, string | null>;
  deliveryNotes: string | null;
};

/**
 * Contact and delivery details for an order shipped within `countryCode`,
 * normalised (trimmed, ASCII digits, E.164 phone, upper-case short address).
 */
export function checkoutDetailsSchema(countryCode: string) {
  const rules = ADDRESS_FIELDS[countryCode];
  return checkoutFormSchema.transform((input, ctx): CheckoutDetails => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const clean = (value: string) => value.trim().replace(/\s+/g, " ");

    const name = clean(input.name);
    if (!name) issue("name", vmsg("required"));
    else if (name.length < 2) issue("name", vmsg("tooShort", { min: 2 }));
    else if (name.length > 120) issue("name", vmsg("tooLong", { max: 120 }));

    const phone = normalizeMobile(countryCode, input.phone);
    if (!input.phone.trim()) issue("phone", vmsg("required"));
    else if (!phone) issue("phone", vmsg(countryCode === "EG" ? "phoneEg" : "phoneSa"));

    const email = clean(input.email).toLowerCase();
    if (email && !z.email().safeParse(email).success) issue("email", vmsg("email"));
    else if (email.length > 254) issue("email", vmsg("tooLong", { max: 254 }));

    const address = {} as Record<AddressField, string | null>;
    if (!rules) {
      issue("city", vmsg("deliveryUnavailable"));
    } else {
      for (const field of Object.keys(FIELD_MAX) as AddressField[]) {
        const rule = rules[field];
        let value = rule === "hidden" ? "" : clean(normalizeDigits(input[field]));
        if (field === "shortAddress") value = value.replace(/\s/g, "").toUpperCase();
        address[field] = value || null;
        if (rule === "hidden") continue;
        if (!value) {
          if (rule === "required") issue(field, vmsg("required"));
          continue;
        }
        if (value.length > FIELD_MAX[field]) issue(field, vmsg("tooLong", { max: FIELD_MAX[field] }));
        if (field === "region" && countryCode === "EG" && !EG_GOVERNORATES.some((g) => g.code === value)) {
          issue(field, vmsg("governorate"));
        }
        if (field === "postalCode" && !/^\d{5}$/.test(value)) issue(field, vmsg("postalCode"));
        if (field === "buildingNumber" && countryCode === "SA" && !/^\d{4}$/.test(value)) {
          issue(field, vmsg("buildingNumberSa"));
        }
        if (field === "shortAddress" && !/^[A-Z]{4}\d{4}$/.test(value)) issue(field, vmsg("shortAddress"));
      }
    }

    const deliveryNotes = clean(input.deliveryNotes);
    if (deliveryNotes.length > 300) issue("deliveryNotes", vmsg("tooLong", { max: 300 }));

    return { name, phone: phone ?? "", email: email || null, address, deliveryNotes: deliveryNotes || null };
  });
}

/** Browser-chosen key of one checkout attempt (a UUID or similar random string). */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, { error: vmsg("invalidReference") });

/**
 * An order line as submitted: the unit price the customer was shown is sent
 * back only so the server can refuse the order if the price has changed since
 * (it is compared, never used).
 */
export const placeOrderLineSchema = cartLineSchema.extend({
  expectedUnitPrice: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,4})?$/)
    .optional(),
});

export const placeOrderInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  locale: z.enum(["ar", "en"]),
  lines: z
    .array(placeOrderLineSchema)
    .min(1)
    .max(CART_MAX_LINES)
    .refine((lines) => new Set(lines.map((line) => line.variantId)).size === lines.length, {
      error: vmsg("duplicateLine"),
    }),
  details: checkoutFormSchema,
});

export type PlaceOrderInput = z.input<typeof placeOrderInputSchema>;
