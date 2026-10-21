import "server-only";
import { unstable_rethrow } from "next/navigation";
import { requireServiceContext } from "@/server/auth/session";
import type { ServiceContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { isForeignKeyViolation, isRecordNotFound, uniqueViolationFields } from "@/server/prisma-errors";
import type { ActionError, ActionResult } from "./result";

/**
 * Run an authenticated Server Action body. Every action goes through here so
 * that authentication, error mapping and logging are uniform:
 *  - the session is re-validated and the actor re-loaded from the database,
 *  - the service decides authorisation (the action never does),
 *  - Next.js control-flow errors (redirect/notFound) are re-thrown,
 *  - domain errors become serialisable results; unexpected errors are logged
 *    with the correlation id and reported to the user only by reference.
 */
export async function runAction<T>(body: (ctx: ServiceContext) => Promise<T>): Promise<ActionResult<T>> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireServiceContext();
    correlationId = ctx.meta.correlationId;
    const data = await body(ctx);
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toActionError(error, correlationId) };
  }
}

export function toActionError(error: unknown, correlationId?: string): ActionError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      messageKey: error.messageKey,
      params: stringParams(error.details),
      fieldErrors: error.fieldErrors,
    };
  }
  // Fallbacks for constraint violations a service did not translate itself.
  if (uniqueViolationFields(error)) return { code: "CONFLICT", messageKey: "errors.conflict.generic" };
  if (isRecordNotFound(error)) return { code: "NOT_FOUND", messageKey: "errors.notFound" };
  if (isForeignKeyViolation(error)) return { code: "VALIDATION", messageKey: "errors.referenceInvalid" };

  const reference = correlationId ?? crypto.randomUUID();
  console.error(`[action] unexpected error ref=${reference}`, error);
  return { code: "INTERNAL", messageKey: "errors.internal", params: { reference } };
}

function stringParams(details?: Record<string, unknown>): Record<string, string | number> | undefined {
  if (!details) return undefined;
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === "string" || typeof value === "number") params[key] = value;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}
