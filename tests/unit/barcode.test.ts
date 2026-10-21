import { describe, expect, it } from "vitest";
import {
  detectGtinType,
  generateInternalBarcode,
  gtinCheckDigit,
  hasValidGtinCheckDigit,
  INTERNAL_BARCODE_PATTERN,
  normalizeBarcode,
  validateBarcode,
} from "@/lib/barcode";

// Reference codes with hand-verified GS1 check digits.
const EAN13 = "4006381333931";
const UPCA = "036000291452";
const EAN8 = "96385074";
const GTIN14 = "14006381333938";

describe("GS1 check digit", () => {
  it("computes the mod-10 check digit", () => {
    expect(gtinCheckDigit(EAN13.slice(0, -1))).toBe(1);
    expect(gtinCheckDigit(UPCA.slice(0, -1))).toBe(2);
    expect(gtinCheckDigit(EAN8.slice(0, -1))).toBe(4);
    expect(gtinCheckDigit(GTIN14.slice(0, -1))).toBe(8);
  });

  it("accepts valid GTINs and rejects corrupted ones", () => {
    for (const code of [EAN13, UPCA, EAN8, GTIN14]) {
      expect(hasValidGtinCheckDigit(code)).toBe(true);
    }
    expect(hasValidGtinCheckDigit("4006381333932")).toBe(false);
    expect(hasValidGtinCheckDigit("12345")).toBe(false);
  });
});

describe("validateBarcode", () => {
  it("validates manufacturer GTINs by symbology", () => {
    expect(validateBarcode(EAN13, "EAN_13", "MANUFACTURER")).toEqual({ ok: true, value: EAN13 });
    expect(validateBarcode(UPCA, "UPC_A", "MANUFACTURER")).toEqual({ ok: true, value: UPCA });
    expect(validateBarcode(EAN8, "EAN_8", "MANUFACTURER")).toEqual({ ok: true, value: EAN8 });
    expect(validateBarcode(GTIN14, "GTIN_14", "MANUFACTURER")).toEqual({ ok: true, value: GTIN14 });
  });

  it("normalises Arabic-Indic digits and whitespace before validating", () => {
    expect(validateBarcode("٤٠٠٦٣٨١ ٣٣٣٩٣١", "EAN_13", "MANUFACTURER")).toEqual({ ok: true, value: EAN13 });
  });

  it("rejects wrong length, non-digits and bad checksums", () => {
    expect(validateBarcode(UPCA, "EAN_13", "MANUFACTURER")).toEqual({ ok: false, reason: "length" });
    expect(validateBarcode("40063813339AB", "EAN_13", "MANUFACTURER")).toEqual({ ok: false, reason: "digits" });
    expect(validateBarcode("4006381333932", "EAN_13", "MANUFACTURER")).toEqual({ ok: false, reason: "checksum" });
  });

  it("never allows an internally assigned code to be a GTIN symbology", () => {
    expect(validateBarcode(EAN13, "EAN_13", "INTERNAL")).toEqual({ ok: false, reason: "sourceMismatch" });
  });

  it("requires internal Code 128 values to start with letters", () => {
    expect(validateBarcode("PF0000123456", "CODE_128", "INTERNAL")).toEqual({ ok: true, value: "PF0000123456" });
    expect(validateBarcode("1234567890123", "CODE_128", "INTERNAL")).toEqual({ ok: false, reason: "internalFormat" });
  });

  it("detects the GTIN type from length", () => {
    expect(detectGtinType(EAN13)).toBe("EAN_13");
    expect(detectGtinType(UPCA)).toBe("UPC_A");
    expect(detectGtinType("ABC")).toBeNull();
  });

  it("generates internal codes matching the internal pattern", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generateInternalBarcode()).toMatch(INTERNAL_BARCODE_PATTERN);
    }
    expect(normalizeBarcode(" pf-12 34 ")).toBe("PF-1234");
  });
});
