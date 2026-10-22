import { normalizeDigits } from "@/lib/digits";

/**
 * Batch rules shared by the browser and the server (ADR-023). Pure functions
 * only: no database, no clock — callers pass "today" as a calendar date in the
 * warehouse's time zone (see `localDateIn`).
 */

export const BATCH_INSPECTION_STATUSES = ["PENDING_INSPECTION", "RELEASED", "QUARANTINED", "REJECTED"] as const;
export type BatchInspectionStatusValue = (typeof BATCH_INSPECTION_STATUSES)[number];

export const EXPIRY_BASES = ["RECORDED", "UNKNOWN", "NOT_TRACKED"] as const;
export type ExpiryBasisValue = (typeof EXPIRY_BASES)[number];

export const VERIFICATION_RESULTS = ["NONE", "PASSED", "FAILED"] as const;
export type VerificationResultValue = (typeof VERIFICATION_RESULTS)[number];

/** Letters, digits, space, hyphen, slash and period; no edge spaces (DR-007). Mirrors the SQL CHECK. */
export const LOT_NUMBER_PATTERN = /^[A-Z0-9./-]([A-Z0-9 ./-]{0,62}[A-Z0-9./-])?$/;

/** Upper-case, ASCII digits, trimmed, inner whitespace collapsed. */
export function normalizeLotNumber(raw: string): string {
  return normalizeDigits(raw).trim().replace(/\s+/g, " ").toUpperCase();
}

export type ParsedExpiry = { date: string; precision: "DAY" | "MONTH" };

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * A label date: "YYYY-MM-DD" (day precision) or "YYYY-MM" (month and year
 * only — stored as the month's last calendar day, DR-007). Null when invalid.
 */
export function parseLabelDate(raw: string): ParsedExpiry | null {
  const text = normalizeDigits(raw).trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
    return isCalendarDate(year, month, date) ? { date: text, precision: "DAY" } : null;
  }
  const month = /^(\d{4})-(\d{2})$/.exec(text);
  if (month) {
    const [year, monthNo] = [Number(month[1]), Number(month[2])];
    if (monthNo < 1 || monthNo > 12 || year < 1900) return null;
    const last = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
    return { date: `${month[1]}-${month[2]}-${String(last).padStart(2, "0")}`, precision: "MONTH" };
  }
  return null;
}

/** Calendar date ("YYYY-MM-DD") of `instant` in `timeZone`. */
export function localDateIn(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "YYYY-MM-DD" plus `days`. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export type EligibilityInput = {
  inspectionStatus: BatchInspectionStatusValue;
  expiryBasis: ExpiryBasisValue;
  /** "YYYY-MM-DD" when the basis is RECORDED. */
  expiresOn: string | null;
  verificationResult: VerificationResultValue;
};

export type ExpiryState = "VALID" | "EXPIRED" | "UNKNOWN" | "NOT_TRACKED";

/** Expired from the day after the effective expiry date (DR-003). */
export function expiryState(batch: Pick<EligibilityInput, "expiryBasis" | "expiresOn">, today: string): ExpiryState {
  if (batch.expiryBasis === "UNKNOWN") return "UNKNOWN";
  if (batch.expiryBasis === "NOT_TRACKED") return "NOT_TRACKED";
  return batch.expiresOn !== null && batch.expiresOn >= today ? "VALID" : "EXPIRED";
}

export type Eligibility =
  { eligible: true } | { eligible: false; reason: "NOT_RELEASED" | "EXPIRED" | "EXPIRY_UNVERIFIED" };

/**
 * May stock of this batch be sold, reserved or fulfilled today? The single
 * application form of the rule; the database mirrors it in
 * `stock_batch_is_sellable` (ADR-023, DR-010). A missing date is never proof of
 * safety or of expiry: unknown expiry needs a passing verification.
 */
export function batchEligibility(batch: EligibilityInput, today: string): Eligibility {
  if (batch.inspectionStatus !== "RELEASED") return { eligible: false, reason: "NOT_RELEASED" };
  const expiry = expiryState(batch, today);
  if (expiry === "EXPIRED") return { eligible: false, reason: "EXPIRED" };
  if (expiry === "UNKNOWN" && batch.verificationResult !== "PASSED") {
    return { eligible: false, reason: "EXPIRY_UNVERIFIED" };
  }
  return { eligible: true };
}

/** Inspection decisions an authorised user may take from each state (REJECTED is final). */
export const INSPECTION_TRANSITIONS: Record<BatchInspectionStatusValue, readonly BatchInspectionStatusValue[]> = {
  PENDING_INSPECTION: ["RELEASED", "QUARANTINED", "REJECTED"],
  RELEASED: ["QUARANTINED"],
  QUARANTINED: ["RELEASED", "REJECTED"],
  REJECTED: [],
};

export function canTransition(from: BatchInspectionStatusValue, to: BatchInspectionStatusValue): boolean {
  return INSPECTION_TRANSITIONS[from].includes(to);
}

/** Does releasing this batch first need a passing verification? (LEGACY or unknown expiry, DR-010) */
export function releaseNeedsVerification(batch: { isLegacy: boolean; expiryBasis: ExpiryBasisValue }): boolean {
  return batch.isLegacy || batch.expiryBasis === "UNKNOWN";
}

export type FefoBatch = { expiresOn: string | null; receivedAt: Date; lotNumber: string | null };

/** First-expiry-first-out: earliest expiry, no expiry last, then received date, then lot number. */
export function compareFefo(a: FefoBatch, b: FefoBatch): number {
  if (a.expiresOn !== b.expiresOn) {
    if (a.expiresOn === null) return 1;
    if (b.expiresOn === null) return -1;
    return a.expiresOn < b.expiresOn ? -1 : 1;
  }
  const received = a.receivedAt.getTime() - b.receivedAt.getTime();
  if (received !== 0) return received;
  return (a.lotNumber ?? "￿").localeCompare(b.lotNumber ?? "￿");
}
