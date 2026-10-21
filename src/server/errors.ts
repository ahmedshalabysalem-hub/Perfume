/**
 * Domain error model. Services throw these; the action/API layer converts them
 * into safe, serialisable responses. Messages are i18n keys (see
 * messages/*.json → "errors"), never raw database or stack details.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "INTERNAL";

/** Field path → list of i18n message keys (or literal messages from validation). */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  /** i18n key under "errors", e.g. "errors.conflict.sku". */
  readonly messageKey: string;
  readonly fieldErrors?: FieldErrors;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    messageKey: string,
    options?: { fieldErrors?: FieldErrors; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(messageKey, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.messageKey = messageKey;
    this.fieldErrors = options?.fieldErrors;
    this.details = options?.details;
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super("UNAUTHENTICATED", "errors.unauthenticated");
  }
}

export class ForbiddenError extends AppError {
  constructor(details?: { permission?: string }) {
    super("FORBIDDEN", "errors.forbidden", { details });
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super("NOT_FOUND", "errors.notFound", { details: { entity } });
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: FieldErrors, messageKey = "errors.validation") {
    super("VALIDATION", messageKey, { fieldErrors });
  }
}

export class ConflictError extends AppError {
  constructor(messageKey: string, fieldErrors?: FieldErrors) {
    super("CONFLICT", messageKey, { fieldErrors });
  }
}

export class InvalidStateError extends AppError {
  constructor(messageKey: string, details?: Record<string, unknown>) {
    super("INVALID_STATE", messageKey, { details });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
