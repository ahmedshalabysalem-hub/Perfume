import type { ErrorCode, FieldErrors } from "@/server/errors";

// Type-only module shared by server actions and client components.

export type ActionError = {
  code: ErrorCode;
  /** i18n key, e.g. "errors.conflict.sku" */
  messageKey: string;
  params?: Record<string, string | number>;
  fieldErrors?: FieldErrors;
};

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };
