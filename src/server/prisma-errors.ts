import { Prisma } from "@/generated/prisma/client";

/**
 * Columns of the unique constraint violated by a P2002 error, or null when the
 * error is not a unique violation. Driver adapters report the constraint in
 * `meta.driverAdapterError.cause.constraint.fields` rather than `meta.target`,
 * so both shapes are handled.
 */
export function uniqueViolationFields(error: unknown): string[] | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const meta = (error.meta ?? {}) as Record<string, unknown>;
  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  const adapterError = meta.driverAdapterError as
    | { cause?: { constraint?: { fields?: unknown; index?: unknown } } }
    | undefined;
  const fields = adapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields)) return fields.map((field) => String(field).replace(/"/g, ""));
  const index = adapterError?.cause?.constraint?.index;
  if (typeof index === "string") return [index];
  return [];
}

/** True if the violated unique constraint involves the given column (snake or camel case). */
export function isUniqueViolationOn(error: unknown, column: string): boolean {
  const fields = uniqueViolationFields(error);
  if (!fields) return false;
  const snake = column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return fields.some((field) => field === column || field === snake || field.includes(snake));
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
