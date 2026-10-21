import type { z } from "zod";
import { NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record ids arriving from the client: anything that is not a UUID is "not found". */
export function parseId(value: unknown, entity: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new NotFoundError(entity);
  return value.toLowerCase();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Validate untrusted input against a schema. Services call this on every
 * entry point, even when the browser already validated the form.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError(zodFieldErrors(result.error));
}

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}
