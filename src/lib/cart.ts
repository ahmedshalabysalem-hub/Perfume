import { CART_MAX_LINES, CART_MAX_QUANTITY } from "@/lib/schemas/checkout";

/**
 * Guest cart contents as kept in the browser (ADR-025): variant ids and whole
 * quantities only — never prices, names, totals or the company. Everything
 * read back from storage is untrusted, so it goes through `sanitizeCartLines`.
 */
export type CartLine = { variantId: string; quantity: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn anything (parsed JSON, a server action argument) into a valid cart:
 * malformed entries are dropped, duplicate variants merged, quantities clamped
 * to 1…CART_MAX_QUANTITY, at most CART_MAX_LINES lines. Never throws.
 */
export function sanitizeCartLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: CartLine[] = [];
  for (const entry of raw.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const { variantId, quantity } = entry as Record<string, unknown>;
    if (typeof variantId !== "string" || !UUID.test(variantId)) continue;
    if (typeof quantity !== "number" || !Number.isFinite(quantity)) continue;
    const id = variantId.toLowerCase();
    const existing = lines.find((line) => line.variantId === id);
    const wanted = Math.trunc(quantity) + (existing?.quantity ?? 0);
    const clamped = Math.min(CART_MAX_QUANTITY, Math.max(1, wanted));
    if (existing) existing.quantity = clamped;
    else if (lines.length < CART_MAX_LINES && Math.trunc(quantity) >= 1)
      lines.push({ variantId: id, quantity: clamped });
  }
  return lines;
}

/** Add `quantity` of a variant, merging with an existing line (same variant = same line). */
export function addToCart(lines: CartLine[], variantId: string, quantity: number): CartLine[] {
  return sanitizeCartLines([...lines, { variantId, quantity }]);
}

/** Set a line's quantity (clamped); 0 or less removes it. */
export function setCartQuantity(lines: CartLine[], variantId: string, quantity: number): CartLine[] {
  if (quantity < 1) return lines.filter((line) => line.variantId !== variantId);
  return sanitizeCartLines(lines.map((line) => (line.variantId === variantId ? { ...line, quantity } : line)));
}

export function cartUnitCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
