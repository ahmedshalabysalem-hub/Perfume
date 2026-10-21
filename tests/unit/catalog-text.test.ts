import { describe, expect, it } from "vitest";
import {
  buildSearchDocument,
  normalizeCode,
  normalizeSearchText,
  normalizeSku,
  SKU_PATTERN,
  SLUG_PATTERN,
  slugify,
} from "@/lib/catalog-text";

describe("normalizeSku", () => {
  it("upper-cases, trims and replaces spaces", () => {
    expect(normalizeSku("  oud-royale 100ml ")).toBe("OUD-ROYALE-100ML");
    expect(SKU_PATTERN.test(normalizeSku("oud royale 100ml"))).toBe(true);
    expect(SKU_PATTERN.test("-BAD")).toBe(false);
    expect(SKU_PATTERN.test("BAD SKU")).toBe(false);
  });
});

describe("slugify", () => {
  it("produces URL-safe ASCII slugs", () => {
    expect(slugify("Oud Royale — Eau de Parfum")).toBe("oud-royale-eau-de-parfum");
    expect(slugify("Café & Co.")).toBe("cafe-and-co");
    expect(SLUG_PATTERN.test(slugify("  Rose  Absolue  "))).toBe(true);
  });

  it("returns an empty string for scripts it cannot transliterate", () => {
    expect(slugify("عطر")).toBe("");
  });
});

describe("normalizeCode", () => {
  it("upper-cases and snake-cases codes", () => {
    expect(normalizeCode(" eau de parfum ")).toBe("EAU_DE_PARFUM");
  });
});

describe("normalizeSearchText", () => {
  it("removes Arabic diacritics and unifies letter variants", () => {
    expect(normalizeSearchText("أُودْ رويال")).toBe("اود رويال");
    expect(normalizeSearchText("إكسترا")).toBe("اكسترا");
    expect(normalizeSearchText("عطر الوردة")).toBe("عطر الورده");
    expect(normalizeSearchText("مُستشفى")).toBe("مستشفي");
    expect(normalizeSearchText("عـــود")).toBe("عود");
  });

  it("matches regardless of hamza or taa marbuta spelling", () => {
    expect(normalizeSearchText("الوردة")).toBe(normalizeSearchText("الورده"));
    expect(normalizeSearchText("أمير")).toBe(normalizeSearchText("امير"));
  });

  it("folds Latin accents and case, and converts Arabic-Indic digits", () => {
    expect(normalizeSearchText("Café NOIR")).toBe("cafe noir");
    expect(normalizeSearchText("١٠٠ مل")).toBe("100 مل");
  });

  it("builds a de-duplicated search document", () => {
    expect(buildSearchDocument(["Oud", "oud", null, "عود"])).toBe("oud عود");
  });
});
