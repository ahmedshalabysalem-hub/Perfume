import { parseMoneyInput } from "@/lib/money";
import { normalizeDigits } from "@/lib/digits";
import {
  BATCH_INSPECTION_STATUSES,
  LOT_NUMBER_PATTERN,
  normalizeLotNumber,
  parseLabelDate,
  type ParsedExpiry,
} from "@/lib/inventory/batches";
import { vmsg, z } from "@/lib/validation/zod";
import { optionalText, optionalUuid, requiredText, uuid } from "./fields";

export const STOCK_STATUSES = ["SELLABLE", "QUARANTINED", "DAMAGED", "RETURNED"] as const;
export const STOCK_MOVEMENT_TYPES = ["OPENING_BALANCE", "ADJUSTMENT", "INSPECTION", "BATCH_ASSIGNMENT"] as const;

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

/** Optional lot number, normalised (upper-case, ASCII digits); empty → null (DR-007). */
export const optionalLotNumber = () =>
  z
    .string()
    .max(80)
    .nullish()
    .transform((value, context) => {
      const lot = value ? normalizeLotNumber(value) : "";
      if (lot === "") return null;
      if (!LOT_NUMBER_PATTERN.test(lot)) {
        context.addIssue({ code: "custom", message: vmsg("lotNumberFormat") });
        return z.NEVER;
      }
      return lot;
    });

/** Optional label date: "YYYY-MM-DD", or "YYYY-MM" stored as the month's last day (DR-007). */
export const optionalLabelDate = () =>
  z
    .string()
    .max(20)
    .nullish()
    .transform((value, context): ParsedExpiry | null => {
      if (!value || value.trim() === "") return null;
      const parsed = parseLabelDate(value);
      if (!parsed) {
        context.addIssue({ code: "custom", message: vmsg("labelDate") });
        return z.NEVER;
      }
      return parsed;
    });

/** Optional full calendar date ("YYYY-MM-DD"). */
export const optionalCalendarDate = () =>
  optionalLabelDate().transform((value, context) => {
    if (value && value.precision !== "DAY") {
      context.addIssue({ code: "custom", message: vmsg("calendarDate") });
      return z.NEVER;
    }
    return value?.date ?? null;
  });

export const openingBalanceSchema = z.object({
  /** SKU or barcode, as typed or scanned. */
  variantCode: requiredText(64),
  warehouseId: uuid(),
  status: z.enum(STOCK_STATUSES),
  quantity: unitQuantity(),
  unitCost: unitCost(),
  reason: requiredText(500),
  /** Required for variants that track batches, refused otherwise (checked by the service). */
  lotNumber: optionalLotNumber(),
  manufacturedOn: optionalCalendarDate(),
  expiresOn: optionalLabelDate(),
});

const batchAction = {
  batchId: uuid(),
  /** Version of the batch the user saw; a stale version is a conflict. */
  version: z.coerce.number().int().min(1),
  reason: requiredText(500),
};

/** A check's outcome: true/false, or "PASS"/"FAIL" from a form; never defaults to either. */
const checkResult = () =>
  z.union([z.boolean(), z.enum(["PASS", "FAIL", ""])]).transform((value, context) => {
    if (typeof value === "boolean") return value;
    if (value === "") {
      context.addIssue({ code: "custom", message: vmsg("required") });
      return z.NEVER;
    }
    return value === "PASS";
  });

/** Expiry found during verification: a label date, none establishable, or not applicable. */
export const VERIFICATION_EXPIRY_OUTCOMES = ["DATE", "UNKNOWN", "NOT_APPLICABLE"] as const;

/** Record a physical-condition and label check (DR-010). Never releases the batch. */
export const batchVerificationSchema = z
  .object({
    ...batchAction,
    physicalCheckOk: checkResult(),
    labelCheckOk: checkResult(),
    notes: optionalText(1000),
    expiryOutcome: z.enum(VERIFICATION_EXPIRY_OUTCOMES),
    expiresOn: optionalLabelDate(),
    /** Lot found on the label; accepted only on LEGACY batches. */
    lotNumber: optionalLotNumber(),
    /** Where the batch goes when a check fails. */
    onFailure: z
      .enum(["QUARANTINED", "REJECTED", ""])
      .nullish()
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (value.expiryOutcome === "DATE" && !value.expiresOn) {
      context.addIssue({ code: "custom", path: ["expiresOn"], message: vmsg("required") });
    }
    if (value.expiryOutcome !== "DATE" && value.expiresOn) {
      context.addIssue({ code: "custom", path: ["expiresOn"], message: vmsg("expiryOutcomeDate") });
    }
    if ((!value.physicalCheckOk || !value.labelCheckOk) && !value.onFailure) {
      context.addIssue({ code: "custom", path: ["onFailure"], message: vmsg("required") });
    }
  });

/** Release, quarantine or reject a batch (separate, explicit decisions). */
export const batchStatusChangeSchema = z.object({
  ...batchAction,
  status: z.enum(["RELEASED", "QUARANTINED", "REJECTED"]),
});

/** Correct a batch's details (DR-005): every field is the new value; empty clears where allowed. */
export const batchDetailsSchema = z.object({
  ...batchAction,
  lotNumber: optionalLotNumber(),
  manufacturedOn: optionalCalendarDate(),
  expiresOn: optionalLabelDate(),
  supplierId: optionalUuid(),
});

export const BATCH_EXPIRY_FILTERS = ["expiring", "expired", "unknown"] as const;

export const batchListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  warehouse: z.uuid().optional().catch(undefined),
  status: z.enum(BATCH_INSPECTION_STATUSES).optional().catch(undefined),
  expiry: z.enum(BATCH_EXPIRY_FILTERS).optional().catch(undefined),
  /** Window of the "expiring" filter (DR-006). */
  days: z.coerce.number().int().min(1).max(3650).default(90).catch(90),
  incomplete: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((value) => value === "1"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
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
export type BatchListQuery = z.output<typeof batchListQuerySchema>;
export type StockListQuery = z.output<typeof stockListQuerySchema>;
export type MovementListQuery = z.output<typeof movementListQuerySchema>;
