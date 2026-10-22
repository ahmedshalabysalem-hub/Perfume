import { parseMoneyInput } from "@/lib/money";
import { normalizeDigits } from "@/lib/digits";
import { vmsg, z } from "@/lib/validation/zod";
import { requiredText, uuid } from "./fields";

export const STOCK_STATUSES = ["SELLABLE", "QUARANTINED", "DAMAGED", "RETURNED"] as const;
export const STOCK_MOVEMENT_TYPES = ["OPENING_BALANCE", "ADJUSTMENT"] as const;

export type StockStatusValue = (typeof STOCK_STATUSES)[number];

/** Unit costs carry up to 4 decimals (ADR-020); more is rejected, not rounded. */
export const UNIT_COST_SCALE = 4;
/** Largest quantity accepted on one movement line. */
export const MAX_LINE_QUANTITY = 1_000_000;

/** Positive whole number of units from a form string ("12", "١٢"). */
export const unitQuantity = () =>
  z.union([z.string(), z.number()]).transform((value, context) => {
    const text = normalizeDigits(String(value)).trim();
    if (text === "") {
      context.addIssue({ code: "custom", message: vmsg("required") });
      return z.NEVER;
    }
    if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > MAX_LINE_QUANTITY) {
      context.addIssue({ code: "custom", message: vmsg("quantity", { max: MAX_LINE_QUANTITY }) });
      return z.NEVER;
    }
    return Number(text);
  });

/** Non-negative unit cost as a canonical decimal string ("12.5" → "12.5000"). Zero is allowed. */
export const unitCost = () =>
  z.union([z.string(), z.number()]).transform((value, context) => {
    const text = String(value).trim();
    if (text === "") {
      context.addIssue({ code: "custom", message: vmsg("required") });
      return z.NEVER;
    }
    const parsed = parseMoneyInput(text, UNIT_COST_SCALE);
    if (!parsed.ok) {
      const key =
        parsed.reason === "precision" ? "costPrecision" : parsed.reason === "range" ? "moneyRange" : "moneyFormat";
      context.addIssue({ code: "custom", message: vmsg(key, { scale: UNIT_COST_SCALE }) });
      return z.NEVER;
    }
    return parsed.value;
  });

export const openingBalanceSchema = z.object({
  /** SKU or barcode, as typed or scanned. */
  variantCode: requiredText(64),
  warehouseId: uuid(),
  status: z.enum(STOCK_STATUSES),
  quantity: unitQuantity(),
  unitCost: unitCost(),
  reason: requiredText(500),
});

export const stockListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  warehouse: z.uuid().optional().catch(undefined),
  status: z.enum(STOCK_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export const movementListQuerySchema = z.object({
  warehouse: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type OpeningBalanceInput = z.input<typeof openingBalanceSchema>;
export type StockListQuery = z.output<typeof stockListQuerySchema>;
export type MovementListQuery = z.output<typeof movementListQuerySchema>;
