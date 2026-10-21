import { normalizeDigits } from "./digits";

export type BarcodeTypeValue = "EAN_13" | "EAN_8" | "UPC_A" | "GTIN_14" | "CODE_128";
export type BarcodeSourceValue = "MANUFACTURER" | "INTERNAL";

const GTIN_LENGTH: Record<Exclude<BarcodeTypeValue, "CODE_128">, number> = {
  EAN_8: 8,
  UPC_A: 12,
  EAN_13: 13,
  GTIN_14: 14,
};

/**
 * Internal (non-GS1) codes: Code 128, must start with letters so they can never
 * be mistaken for — or collide with — a manufacturer GTIN.
 */
export const INTERNAL_BARCODE_PATTERN = /^[A-Z]{2,4}[A-Z0-9-]{4,40}$/;
export const INTERNAL_BARCODE_PREFIX = "PF";

/** Remove whitespace/hyphens from scanned or typed codes; normalise digits and case. */
export function normalizeBarcode(raw: string): string {
  return normalizeDigits(raw).trim().replace(/\s+/g, "").toUpperCase();
}

/** GS1 mod-10 check digit for the given digits (without the check digit). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  // Weights alternate 3,1,3,1… starting from the rightmost digit of the body.
  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[body.length - 1 - index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidGtinCheckDigit(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const body = code.slice(0, -1);
  return gtinCheckDigit(body) === Number(code[code.length - 1]);
}

export type BarcodeValidation =
  | { ok: true; value: string }
  | { ok: false; reason: "length" | "digits" | "checksum" | "internalFormat" | "sourceMismatch" };

/**
 * Validate a barcode for its declared symbology and source.
 *  - GTIN symbologies: exact digit length + valid GS1 check digit, and the code
 *    must come from the manufacturer (we never invent GTINs).
 *  - CODE_128: manufacturer codes are any printable ASCII up to 48 chars;
 *    internal codes must match INTERNAL_BARCODE_PATTERN.
 */
export function validateBarcode(raw: string, type: BarcodeTypeValue, source: BarcodeSourceValue): BarcodeValidation {
  const value = normalizeBarcode(raw);
  if (type === "CODE_128") {
    if (source === "INTERNAL") {
      return INTERNAL_BARCODE_PATTERN.test(value) ? { ok: true, value } : { ok: false, reason: "internalFormat" };
    }
    return /^[\x21-\x7e]{1,48}$/.test(value) ? { ok: true, value } : { ok: false, reason: "internalFormat" };
  }
  if (source === "INTERNAL") return { ok: false, reason: "sourceMismatch" };
  if (!/^\d+$/.test(value)) return { ok: false, reason: "digits" };
  if (value.length !== GTIN_LENGTH[type]) return { ok: false, reason: "length" };
  if (!hasValidGtinCheckDigit(value)) return { ok: false, reason: "checksum" };
  return { ok: true, value };
}

/** Suggest the GTIN symbology from a digit-only code's length. */
export function detectGtinType(code: string): Exclude<BarcodeTypeValue, "CODE_128"> | null {
  const value = normalizeBarcode(code);
  if (!/^\d+$/.test(value)) return null;
  switch (value.length) {
    case 8:
      return "EAN_8";
    case 12:
      return "UPC_A";
    case 13:
      return "EAN_13";
    case 14:
      return "GTIN_14";
    default:
      return null;
  }
}

/** Generate a candidate internal Code 128 value (uniqueness is checked by the caller). */
export function generateInternalBarcode(random: () => number = Math.random): string {
  let digits = "";
  for (let index = 0; index < 10; index += 1) digits += Math.floor(random() * 10).toString();
  return `${INTERNAL_BARCODE_PREFIX}${digits}`;
}
