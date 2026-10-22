import { describe, expect, it } from "vitest";
import { openingBalanceSchema, unitCost, unitQuantity } from "@/lib/schemas/inventory";

describe("inventory field schemas", () => {
  it("parses whole unit quantities, including Arabic-Indic digits", () => {
    expect(unitQuantity().parse("12")).toBe(12);
    expect(unitQuantity().parse("١٢")).toBe(12);
    for (const bad of ["", "0", "-3", "1.5", "1e3", "1000001"]) {
      expect(unitQuantity().safeParse(bad).success, bad).toBe(false);
    }
  });

  it("keeps unit costs exact to 4 decimals and rejects more instead of rounding", () => {
    expect(unitCost().parse("12.5")).toBe("12.5000");
    expect(unitCost().parse("0")).toBe("0.0000");
    expect(unitCost().parse("1,250.1234")).toBe("1250.1234");
    const precise = unitCost().safeParse("1.23456");
    expect(precise.success).toBe(false);
    expect(precise.error?.issues[0]?.message).toBe('validation.costPrecision|{"scale":4}');
    expect(unitCost().safeParse("-1").success).toBe(false);
  });

  it("requires every opening-balance field", () => {
    const result = openingBalanceSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(new Set(result.error?.issues.map((issue) => issue.path[0]))).toEqual(
      new Set(["variantCode", "warehouseId", "status", "quantity", "unitCost", "reason"]),
    );
  });
});
