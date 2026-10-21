/**
 * Prepare values for the audit log: remove anything secret, and convert
 * non-JSON values (Decimal, Date, BigInt) into stable string forms.
 */

const SECRET_KEY_PATTERN = /pass(word)?|secret|token|hash|api[-_]?key|authorization|cookie/i;
const MAX_DEPTH = 6;
const MAX_STRING = 2000;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isDecimalLike(value: unknown): value is { toFixed: () => string; toString: () => string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toFixed" in value &&
    "isFinite" in value &&
    typeof (value as { toString: unknown }).toString === "function"
  );
}

export function redactForAudit(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (isDecimalLike(value)) return value.toString();
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactForAudit(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = "[redacted]";
        continue;
      }
      if (item === undefined || typeof item === "function") continue;
      output[key] = redactForAudit(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

/**
 * Keep only the keys whose values differ, to make audit "before/after" pairs
 * small and readable. Values are compared after redaction/serialisation.
 */
export function diffForAudit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, JsonValue>; after: Record<string, JsonValue> } {
  const redactedBefore = redactForAudit(before) as Record<string, JsonValue>;
  const redactedAfter = redactForAudit(after) as Record<string, JsonValue>;
  const changedBefore: Record<string, JsonValue> = {};
  const changedAfter: Record<string, JsonValue> = {};
  const keys = new Set([...Object.keys(redactedBefore), ...Object.keys(redactedAfter)]);
  for (const key of keys) {
    const a = JSON.stringify(redactedBefore[key] ?? null);
    const b = JSON.stringify(redactedAfter[key] ?? null);
    if (a !== b) {
      changedBefore[key] = redactedBefore[key] ?? null;
      changedAfter[key] = redactedAfter[key] ?? null;
    }
  }
  return { before: changedBefore, after: changedAfter };
}
