import { describe, expect, it } from "vitest";
import { supplierContactSchema, supplierCreateSchema, supplierProductCreateSchema } from "@/lib/schemas/procurement";

const base = {
  code: "sup 1",
  legalEntityId: "0190a000-0000-7000-8000-000000000003",
  nameEn: "Gulf Oud",
  nameAr: "عود الخليج",
  supplierCountryCode: "sa",
  taxRegistrationNo: "",
  commercialRegistrationNo: "",
  paymentTerms: "NET",
  paymentTermDays: "٣٠",
  currencyCode: "sar",
  email: "",
  phone: "",
  websiteUrl: "",
  addressLine1: "",
  city: "",
  notes: "",
};

describe("supplier schema", () => {
  it("normalises codes, countries, currencies and Arabic-Indic digits", () => {
    const parsed = supplierCreateSchema.parse({ ...base, taxRegistrationNo: "٣٠٠ ٠٠٠ ٠٠٠ ٠٠٠ ٠٠٣" });
    expect(parsed).toMatchObject({
      code: "SUP_1",
      supplierCountryCode: "SA",
      currencyCode: "SAR",
      paymentTermDays: 30,
      taxRegistrationNo: "300000000000003",
      email: null,
    });
  });

  it("applies the tax-number rule of the supplier's country", () => {
    expect(supplierCreateSchema.safeParse({ ...base, taxRegistrationNo: "300000000000004" }).success).toBe(false);
    expect(
      supplierCreateSchema.safeParse({ ...base, supplierCountryCode: "EG", taxRegistrationNo: "123456789" }).success,
    ).toBe(true);
    expect(
      supplierCreateSchema.safeParse({ ...base, supplierCountryCode: "EG", taxRegistrationNo: "1234567890" }).success,
    ).toBe(false);
    expect(
      supplierCreateSchema.safeParse({ ...base, supplierCountryCode: "DE", taxRegistrationNo: "DE123456789" }).success,
    ).toBe(true);
  });

  it("requires 1–365 credit days for NET terms and drops days for other terms", () => {
    expect(supplierCreateSchema.safeParse({ ...base, paymentTermDays: "" }).success).toBe(false);
    expect(supplierCreateSchema.safeParse({ ...base, paymentTermDays: "0" }).success).toBe(false);
    expect(supplierCreateSchema.safeParse({ ...base, paymentTermDays: "366" }).success).toBe(false);
    expect(
      supplierCreateSchema.parse({ ...base, paymentTerms: "ON_DELIVERY", paymentTermDays: "15" }).paymentTermDays,
    ).toBeNull();
    expect(supplierCreateSchema.safeParse({ ...base, paymentTerms: "LATER" }).success).toBe(false);
  });
});

describe("supplier product and contact schemas", () => {
  it("upper-cases supplier codes and keeps costs exact", () => {
    const parsed = supplierProductCreateSchema.parse({
      variantCode: "QA-ROI-50",
      supplierSku: "  dod-roi   050 ",
      supplierProductName: "",
      lastCostAmount: "95.5",
    });
    expect(parsed).toMatchObject({ supplierSku: "DOD-ROI 050", supplierProductName: null, lastCostAmount: "95.50" });
    expect(
      supplierProductCreateSchema.safeParse({ variantCode: "X", supplierSku: "Y", lastCostAmount: "1.005" }).success,
    ).toBe(false);
    expect(
      supplierProductCreateSchema.safeParse({ variantCode: "X", supplierSku: "Y", lastCostAmount: "0" }).success,
    ).toBe(false);
    expect(supplierProductCreateSchema.safeParse({ variantCode: "X", supplierSku: " " }).success).toBe(false);
  });

  it("requires a contact name and a valid e-mail when given", () => {
    expect(supplierContactSchema.safeParse({ name: "", isPrimary: false }).success).toBe(false);
    expect(supplierContactSchema.safeParse({ name: "Mona", email: "not-an-email", isPrimary: false }).success).toBe(
      false,
    );
    expect(supplierContactSchema.parse({ name: "Mona", email: "Mona@Example.com", isPrimary: true })).toMatchObject({
      email: "mona@example.com",
      jobTitle: null,
    });
  });
});
