import type { z } from "zod";
import { ValidationError, type FieldErrors } from "@/server/errors";

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
