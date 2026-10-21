"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/**
 * Validate in the browser for immediate feedback, but submit the *raw* form
 * values: the server re-parses them with the same schema, which is the
 * authoritative validation (transforms are applied exactly once, server-side).
 */
export function formResolver<TValues extends FieldValues>(schema: z.ZodType<unknown, TValues>): Resolver<TValues> {
  return zodResolver(schema as never, undefined, { raw: true }) as unknown as Resolver<TValues>;
}
