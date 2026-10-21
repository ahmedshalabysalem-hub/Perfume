import { normalizeDigits } from "./digits";

/** SKU rule: upper-case letters, digits and . _ / - ; starts alphanumeric; ≤ 64 chars. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,63}$/;

export function normalizeSku(raw: string): string {
  return normalizeDigits(raw).trim().toUpperCase().replace(/\s+/g, "-");
}

/** Slugs: lower-case ASCII words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(input: string, maxLength = 120): string {
  return normalizeDigits(input)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Reference codes (families, concentrations, stores…): upper-case snake/kebab. */
export function normalizeCode(raw: string): string {
  return normalizeDigits(raw).trim().toUpperCase().replace(/\s+/g, "_");
}

/**
 * Normalise text for search in Arabic and Latin scripts:
 *  - NFKD + strip combining marks (Arabic tashkeel, Latin accents; also
 *    reduces hamza/madda carriers: أ إ آ → ا, ؤ → و, ئ → ي)
 *  - unify alef maqsura and taa marbuta (ى → ي, ة → ه), drop tatweel
 *  - Arabic-Indic digits → ASCII, lower-case, collapse punctuation/space
 */
export function normalizeSearchText(input: string): string {
  return normalizeDigits(input)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Build the stored search document from its parts. */
export function buildSearchDocument(parts: Array<string | null | undefined>): string {
  const tokens = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const normalized = normalizeSearchText(part);
    if (normalized) tokens.add(normalized);
  }
  return [...tokens].join(" ").slice(0, 4000);
}
