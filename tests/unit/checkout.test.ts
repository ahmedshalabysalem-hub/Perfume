import { describe, expect, it } from "vitest";
import { addToCart, cartUnitCount, sanitizeCartLines, setCartQuantity } from "@/lib/cart";
import { multiplyMoney, sumMoney } from "@/lib/money";
import {
  ADDRESS_FIELDS,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  checkoutDetailsSchema,
  normalizeMobile,
  placeOrderInputSchema,
} from "@/lib/schemas/checkout";

// ORD-001 shared rules (ADR-025): cart contents, exact totals, contact and address.

const A = "0190a1b2-0000-7000-8000-000000000001";
const B = "0190a1b2-0000-7000-8000-000000000002";

describe("exact money arithmetic", () => {
  it("multiplies and sums without floating-point error", () => {
    expect(multiplyMoney("0.10", 3)).toBe("0.30");
    expect(multiplyMoney("45.50", 3)).toBe("136.50");
    expect(multiplyMoney("999999999999.99", 10)).toBe("9999999999999.90");
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney([])).toBe("0.00");
    expect(sumMoney(["120", "45.5"])).toBe("165.50");
    expect(multiplyMoney("7", 2, 0)).toBe("14");
  });

  it("refuses excess precision and bad quantities instead of rounding", () => {
    expect(() => multiplyMoney("1.005", 1)).toThrow();
    expect(() => multiplyMoney("1.00", -1)).toThrow();
    expect(() => multiplyMoney("1.00", 1.5)).toThrow();
    expect(() => sumMoney(["abc"])).toThrow();
  });
});

describe("guest cart lines", () => {
  it("merges the same variant into one line and keeps different variants apart", () => {
    let cart = addToCart([], A, 1);
    cart = addToCart(cart, A, 2);
    cart = addToCart(cart, B, 1);
    expect(cart).toEqual([
      { variantId: A, quantity: 3 },
      { variantId: B, quantity: 1 },
    ]);
    expect(cartUnitCount(cart)).toBe(4);
  });

  it("clamps quantities and removes lines set below one", () => {
    expect(addToCart([{ variantId: A, quantity: 9 }], A, 5)).toEqual([{ variantId: A, quantity: CART_MAX_QUANTITY }]);
    expect(setCartQuantity([{ variantId: A, quantity: 2 }], A, 0)).toEqual([]);
    expect(setCartQuantity([{ variantId: A, quantity: 2 }], A, 50)).toEqual([{ variantId: A, quantity: 10 }]);
  });

  it("treats stored data as untrusted: drops malformed entries, never throws", () => {
    expect(sanitizeCartLines(null)).toEqual([]);
    expect(sanitizeCartLines("[]")).toEqual([]);
    expect(
      sanitizeCartLines([
        { variantId: A.toUpperCase(), quantity: 2.7, price: "0.01" },
        { variantId: "x", quantity: 1 },
        { variantId: B, quantity: Number.NaN },
        { variantId: B, quantity: 0 },
        { variantId: B, quantity: "3" },
        42,
      ]),
    ).toEqual([{ variantId: A, quantity: 2 }]);
  });

  it("holds at most the maximum number of lines", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      variantId: `0190a1b2-0000-7000-8000-${String(i).padStart(12, "0")}`,
      quantity: 1,
    }));
    expect(sanitizeCartLines(many)).toHaveLength(CART_MAX_LINES);
  });
});

describe("mobile numbers", () => {
  it("normalises Saudi and Egyptian mobiles to E.164", () => {
    expect(normalizeMobile("SA", "0512345678")).toBe("+966512345678");
    expect(normalizeMobile("SA", "+966 51 234 5678")).toBe("+966512345678");
    expect(normalizeMobile("SA", "00966512345678")).toBe("+966512345678");
    expect(normalizeMobile("SA", "٠٥١٢٣٤٥٦٧٨")).toBe("+966512345678");
    expect(normalizeMobile("EG", "01012345678")).toBe("+201012345678");
    expect(normalizeMobile("EG", "+20 115 123 4567")).toBe("+201151234567");
  });

  it("refuses landlines, other countries' numbers and junk", () => {
    expect(normalizeMobile("SA", "0112345678")).toBeNull();
    expect(normalizeMobile("SA", "01012345678")).toBeNull();
    expect(normalizeMobile("EG", "0512345678")).toBeNull();
    expect(normalizeMobile("EG", "01312345678")).toBeNull();
    expect(normalizeMobile("SA", "05123abc78")).toBeNull();
    expect(normalizeMobile("AE", "0501234567")).toBeNull();
  });
});

describe("checkout details", () => {
  const sa = checkoutDetailsSchema("SA");
  const eg = checkoutDetailsSchema("EG");

  it("normalises a valid Saudi address and drops fields the country does not use", () => {
    const parsed = sa.parse({
      name: "  Sara   Ahmed ",
      phone: "0512345678",
      email: " Sara@Example.COM ",
      region: "C",
      city: "Riyadh",
      district: "Olaya",
      street: "King Fahd Rd",
      buildingNumber: "١٢٣٤",
      shortAddress: "rrrd 2929",
    });
    expect(parsed).toMatchObject({
      name: "Sara Ahmed",
      phone: "+966512345678",
      email: "sara@example.com",
      address: { region: null, buildingNumber: "1234", shortAddress: "RRRD2929", postalCode: null },
      deliveryNotes: null,
    });
  });

  it("requires the fields each country asks for", () => {
    const saResult = sa.safeParse({ name: "S", phone: "", city: "", street: "x" });
    expect(saResult.success).toBe(false);
    const paths = saResult.error!.issues.map((issue) => issue.path.join("."));
    expect(paths.sort()).toEqual(["city", "district", "name", "phone"]);

    const egResult = eg.safeParse({ name: "Mona", phone: "01012345678", city: "Nasr City", street: "Abbas" });
    expect(egResult.error!.issues.map((issue) => issue.path.join("."))).toEqual(["region"]);
    expect(
      eg.parse({ name: "Mona", phone: "01012345678", region: "GZ", city: "Dokki", street: "Tahrir" }).address,
    ).toMatchObject({ region: "GZ", district: null, shortAddress: null });
  });

  it("only delivers to configured countries", () => {
    expect(Object.keys(ADDRESS_FIELDS).sort()).toEqual(["EG", "SA"]);
    expect(
      checkoutDetailsSchema("AE").safeParse({ name: "X Y", phone: "0501234567", city: "Dubai", street: "a" }).success,
    ).toBe(false);
  });

  it("accepts only whole quantities within limits and no duplicate lines", () => {
    const base = { idempotencyKey: "abcdefghijklmnop", locale: "ar", details: {} };
    expect(placeOrderInputSchema.safeParse({ ...base, lines: [{ variantId: A, quantity: 1 }] }).success).toBe(true);
    for (const quantity of [0, -1, 1.5, 11]) {
      expect(placeOrderInputSchema.safeParse({ ...base, lines: [{ variantId: A, quantity }] }).success).toBe(false);
    }
    expect(
      placeOrderInputSchema.safeParse({
        ...base,
        lines: [
          { variantId: A, quantity: 1 },
          { variantId: A, quantity: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      placeOrderInputSchema.safeParse({ ...base, idempotencyKey: "short", lines: [{ variantId: A, quantity: 1 }] })
        .success,
    ).toBe(false);
  });
});
