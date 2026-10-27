import { normalizeDigits } from "./digits";

/**
 * Money handling rules (see docs/BUSINESS_RULES.md §Money):
 *  - Amounts are exact decimals, stored as PostgreSQL NUMERIC and carried as
 *    strings outside the database layer. JavaScript floats are never used.
 *  - Catalogue prices are entered in the currency's minor units precision
 *    (2 decimals for SAR and EGP). Inputs with more decimals are rejected,
 *    not rounded, so nobody's price silently changes.
 *  - Where rounding is required (tax, discounts — later phases) the rule is
 *    half-up at the currency's minor unit, applied per line.
 */

const MAX_INTEGER_DIGITS = 12;

export type MoneyParseResult = { ok: true; value: string } | { ok: false; reason: "format" | "precision" | "range" };

/**
 * Parse user input into a canonical decimal string with exactly `minorUnits`
 * decimals ("1,250.5" → "1250.50"). Accepts Arabic-Indic digits.
 */
export function parseMoneyInput(raw: string, minorUnits = 2): MoneyParseResult {
  const input = normalizeDigits(raw).trim().replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(input)) return { ok: false, reason: "format" };
  const [integerPart = "", fractionPart = ""] = input.split(".");
  if (fractionPart.length > minorUnits) return { ok: false, reason: "precision" };
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  if (integer.length > MAX_INTEGER_DIGITS) return { ok: false, reason: "range" };
  const fraction = fractionPart.padEnd(minorUnits, "0");
  return { ok: true, value: minorUnits > 0 ? `${integer}.${fraction}` : integer };
}

/** Compare two canonical decimal strings (non-negative). Returns -1, 0 or 1. */
export function compareDecimalStrings(a: string, b: string): number {
  const [ai = "0", af = ""] = a.split(".");
  const [bi = "0", bf = ""] = b.split(".");
  const aInt = ai.replace(/^0+(?=\d)/, "");
  const bInt = bi.replace(/^0+(?=\d)/, "");
  if (aInt.length !== bInt.length) return aInt.length < bInt.length ? -1 : 1;
  if (aInt !== bInt) return aInt < bInt ? -1 : 1;
  const length = Math.max(af.length, bf.length);
  const aFrac = af.padEnd(length, "0");
  const bFrac = bf.padEnd(length, "0");
  if (aFrac === bFrac) return 0;
  return aFrac < bFrac ? -1 : 1;
}

export function isPositiveDecimalString(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value) && /[1-9]/.test(value);
}

/**
 * Format an exact decimal string as currency. Uses Latin digits in both
 * locales for consistency with SKUs and receipts (configurable later).
 * `Intl.NumberFormat#format` accepts decimal strings without converting them
 * to floats (ECMA-402 NumberFormat v3).
 */
export function formatMoney(amount: string, currency: string, locale: string, minorUnits = 2): string {
  const formatter = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  });
  return formatter.format(amount as unknown as number);
}

// ─── Exact arithmetic on canonical decimal strings (cart and order totals) ───
// Amounts are converted to integer minor units (BigInt), so the browser and
// the server compute identical totals without floats or rounding.

function toMinorUnits(amount: string, minorUnits: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) throw new Error(`not a canonical decimal amount: ${amount}`);
  const fraction = match[2] ?? "";
  if (fraction.length > minorUnits) throw new Error(`amount ${amount} has more than ${minorUnits} decimals`);
  return BigInt(match[1]! + fraction.padEnd(minorUnits, "0"));
}

function fromMinorUnits(value: bigint, minorUnits: number): string {
  const digits = value.toString().padStart(minorUnits + 1, "0");
  if (minorUnits === 0) return digits;
  return `${digits.slice(0, -minorUnits)}.${digits.slice(-minorUnits)}`;
}

/** `amount × quantity` for a whole-unit quantity, exact ("12.50" × 3 → "37.50"). */
export function multiplyMoney(amount: string, quantity: number, minorUnits = 2): string {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("quantity must be a non-negative integer");
  return fromMinorUnits(toMinorUnits(amount, minorUnits) * BigInt(quantity), minorUnits);
}

/** Sum of canonical decimal amounts, exact. */
export function sumMoney(amounts: readonly string[], minorUnits = 2): string {
  return fromMinorUnits(
    amounts.reduce((total, amount) => total + toMinorUnits(amount, minorUnits), 0n),
    minorUnits,
  );
}
