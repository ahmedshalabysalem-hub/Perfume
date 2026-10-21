"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { parseMessageDescriptor } from "@/lib/validation/zod";

type LooseTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

/**
 * Translate message descriptors produced by validation schemas and services
 * ("validation.tooLong|{\"max\":120}", "errors.conflict.sku", …). Unknown
 * keys are returned unchanged so nothing is silently swallowed.
 */
export function useTranslateMessage() {
  const t = useTranslations() as unknown as LooseTranslator;
  return useCallback(
    (descriptor: string | undefined | null, params?: Record<string, string | number>): string => {
      if (!descriptor) return "";
      const parsed = parseMessageDescriptor(descriptor);
      if (!t.has(parsed.key)) return descriptor;
      return t(parsed.key, { ...parsed.params, ...params });
    },
    [t],
  );
}
