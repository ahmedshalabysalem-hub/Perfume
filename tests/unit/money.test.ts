import { describe, expect, it } from "vitest";
import { normalizeDigits } from "@/lib/digits";
import { compareDecimalStrings, formatMoney, isPositiveDecimalString, parseMoneyInput } from "@/lib/money";

describe("parseMoneyInput", () => {
  it("canonicalises to the currency precision", () => {
    expect(parseMoneyInput("1,250.5")).toEqual({ ok: true, value: "1250.50" });
    expect(parseMoneyInput("0012.30")).toEqual({ ok: true, value: "12.30" });
    expect(parseMoneyInput("99")).toEqual({ ok: true, value: "99.00" });
    expect(parseMoneyInput("0.5")).toEqual({ ok: true, value: "0.50" });
  });

  it("accepts Arabic-Indic digits and the Arabic decimal separator", () => {
    expect(parseMoneyInput("١٢٣٫٤٥")).toEqual({ ok: true, value: "123.45" });
    expect(normalizeDigits("۱۲۳")).toBe("123");
  });

  it("rejects extra precision instead of rounding", () => {
    expect(parseMoneyInput("10.999")).toEqual({ ok: false, reason: "precision" });
  });

  it("rejects malformed and negative input", () => {
    expect(parseMoneyInput("abc")).toEqual({ ok: false, reason: "format" });
    expect(parseMoneyInput("-5")).toEqual({ ok: false, reason: "format" });
    expect(parseMoneyInput("1.2.3")).toEqual({ ok: false, reason: "format" });
    expect(parseMoneyInput("1234567890123")).toEqual({ ok: false, reason: "range" });
  });
});

describe("decimal comparison", () => {
  it("compares exactly without floats", () => {
    expect(compareDecimalStrings("10.00", "9.99")).toBe(1);
    expect(compareDecimalStrings("0.10", "0.1")).toBe(0);
    expect(compareDecimalStrings("100.00", "1000.00")).toBe(-1);
    // A float comparison would get this wrong: 0.1 + 0.2 !== 0.3
    expect(compareDecimalStrings("0.30", "0.3")).toBe(0);
  });

  it("detects positive amounts", () => {
    expect(isPositiveDecimalString("0.01")).toBe(true);
    expect(isPositiveDecimalString("0.00")).toBe(false);
  });
});

describe("formatMoney", () => {
  it("formats SAR and EGP with two decimals and Latin digits", () => {
    expect(formatMoney("1250.50", "SAR", "en")).toContain("1,250.50");
    expect(formatMoney("1250.50", "EGP", "en")).toContain("1,250.50");
    expect(formatMoney("1250.50", "SAR", "ar")).toMatch(/1,?250\.50/);
  });

  it("formats large exact amounts without float drift", () => {
    expect(formatMoney("123456789012.35", "SAR", "en")).toContain("123,456,789,012.35");
  });
});
