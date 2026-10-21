import "server-only";
import { slugify } from "@/lib/catalog-text";

/**
 * Resolve the slug for a new or renamed record. An explicit slug is used as
 * given (a clash is reported as a conflict); a generated slug is made unique
 * by appending -2, -3, … .
 */
export async function resolveSlug(options: {
  explicit: string | null;
  source: string;
  fallbackPrefix: string;
  exists: (slug: string) => Promise<boolean>;
  maxLength?: number;
}): Promise<{ slug: string; generated: boolean }> {
  if (options.explicit) return { slug: options.explicit, generated: false };
  const maxLength = options.maxLength ?? 120;
  let base = slugify(options.source, maxLength - 6);
  if (!base) base = `${options.fallbackPrefix}-${crypto.randomUUID().slice(0, 8)}`;
  let candidate = base;
  for (let suffix = 2; await options.exists(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
    if (suffix > 200) {
      candidate = `${base}-${crypto.randomUUID().slice(0, 8)}`;
      break;
    }
  }
  return { slug: candidate, generated: true };
}
