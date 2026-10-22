import { describe, expect, it } from "vitest";
import {
  addDays,
  batchEligibility,
  canTransition,
  compareFefo,
  expiryState,
  localDateIn,
  LOT_NUMBER_PATTERN,
  normalizeLotNumber,
  parseLabelDate,
  releaseNeedsVerification,
  type EligibilityInput,
} from "@/lib/inventory/batches";
import { batchListQuerySchema, batchVerificationSchema, openingBalanceSchema } from "@/lib/schemas/inventory";

const released: EligibilityInput = {
  inspectionStatus: "RELEASED",
  expiryBasis: "RECORDED",
  expiresOn: "2027-03-31",
  verificationResult: "NONE",
};

describe("label dates (DR-007)", () => {
  it("keeps a full date at day precision", () => {
    expect(parseLabelDate("2027-02-14")).toEqual({ date: "2027-02-14", precision: "DAY" });
  });

  it("stores a month-only date as the month's last day, flagged as month precision", () => {
    expect(parseLabelDate("2027-02")).toEqual({ date: "2027-02-28", precision: "MONTH" });
    expect(parseLabelDate("2028-02")).toEqual({ date: "2028-02-29", precision: "MONTH" });
    expect(parseLabelDate("2027-12")).toEqual({ date: "2027-12-31", precision: "MONTH" });
  });

  it("accepts Arabic-Indic digits and refuses impossible dates", () => {
    expect(parseLabelDate("٢٠٢٧-٠٤")).toEqual({ date: "2027-04-30", precision: "MONTH" });
    expect(parseLabelDate("2027-02-30")).toBeNull();
    expect(parseLabelDate("2027-13")).toBeNull();
    expect(parseLabelDate("31/12/2027")).toBeNull();
  });
});

describe("lot numbers", () => {
  it("normalises and validates the allowed characters", () => {
    expect(normalizeLotNumber("  ab-12 / 3.4 ")).toBe("AB-12 / 3.4");
    expect(LOT_NUMBER_PATTERN.test("AB-12 / 3.4")).toBe(true);
    expect(LOT_NUMBER_PATTERN.test("AB_12")).toBe(false);
    expect(LOT_NUMBER_PATTERN.test("A".repeat(64))).toBe(true);
    expect(LOT_NUMBER_PATTERN.test("A".repeat(65))).toBe(false);
  });
});

describe("warehouse local date (DR-003)", () => {
  // 2027-03-31 21:30 UTC is already 1 April in Riyadh (UTC+3) but still 31 March in Cairo (UTC+2).
  const instant = new Date("2027-03-31T21:30:00Z");

  it("differs across midnight between Riyadh and Cairo", () => {
    expect(localDateIn("Asia/Riyadh", instant)).toBe("2027-04-01");
    expect(localDateIn("Africa/Cairo", instant)).toBe("2027-03-31");
  });

  it("makes stock expiring on 31 March ineligible in Riyadh while still eligible in Cairo", () => {
    expect(batchEligibility(released, localDateIn("Asia/Riyadh", instant))).toEqual({
      eligible: false,
      reason: "EXPIRED",
    });
    expect(batchEligibility(released, localDateIn("Africa/Cairo", instant))).toEqual({ eligible: true });
  });

  it("adds days across month ends", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDays("2027-12-31", 90)).toBe("2028-03-30");
  });
});

describe("sale eligibility (ADR-023, DR-010)", () => {
  it("is eligible on the expiry date and expired the day after (AC 20)", () => {
    expect(batchEligibility(released, "2027-03-31").eligible).toBe(true);
    expect(batchEligibility(released, "2027-04-01")).toEqual({ eligible: false, reason: "EXPIRED" });
  });

  it("is never eligible unless released (AC 2)", () => {
    for (const inspectionStatus of ["PENDING_INSPECTION", "QUARANTINED", "REJECTED"] as const) {
      expect(batchEligibility({ ...released, inspectionStatus }, "2027-01-01")).toEqual({
        eligible: false,
        reason: "NOT_RELEASED",
      });
    }
  });

  it("needs a passing verification when expiry is unknown (AC 16, 17)", () => {
    const unknown = { ...released, expiryBasis: "UNKNOWN" as const, expiresOn: null };
    expect(batchEligibility(unknown, "2027-01-01")).toEqual({ eligible: false, reason: "EXPIRY_UNVERIFIED" });
    expect(batchEligibility({ ...unknown, verificationResult: "FAILED" }, "2027-01-01").eligible).toBe(false);
    expect(batchEligibility({ ...unknown, verificationResult: "PASSED" }, "2027-01-01").eligible).toBe(true);
  });

  it("treats a not-tracked expiry as no expiry, and an unknown one as neither safe nor expired", () => {
    expect(expiryState({ expiryBasis: "NOT_TRACKED", expiresOn: null }, "2027-01-01")).toBe("NOT_TRACKED");
    expect(expiryState({ expiryBasis: "UNKNOWN", expiresOn: null }, "2099-01-01")).toBe("UNKNOWN");
    expect(batchEligibility({ ...released, expiryBasis: "NOT_TRACKED", expiresOn: null }, "2099-01-01").eligible).toBe(
      true,
    );
  });
});

describe("inspection transitions", () => {
  it("follows the v4 table; REJECTED is final and RELEASED is quarantined before rejection", () => {
    expect(canTransition("PENDING_INSPECTION", "RELEASED")).toBe(true);
    expect(canTransition("PENDING_INSPECTION", "REJECTED")).toBe(true);
    expect(canTransition("RELEASED", "QUARANTINED")).toBe(true);
    expect(canTransition("RELEASED", "REJECTED")).toBe(false);
    expect(canTransition("QUARANTINED", "RELEASED")).toBe(true);
    expect(canTransition("REJECTED", "RELEASED")).toBe(false);
    expect(canTransition("REJECTED", "QUARANTINED")).toBe(false);
  });

  it("requires verification before releasing LEGACY or unknown-expiry batches", () => {
    expect(releaseNeedsVerification({ isLegacy: true, expiryBasis: "RECORDED" })).toBe(true);
    expect(releaseNeedsVerification({ isLegacy: false, expiryBasis: "UNKNOWN" })).toBe(true);
    expect(releaseNeedsVerification({ isLegacy: false, expiryBasis: "RECORDED" })).toBe(false);
    expect(releaseNeedsVerification({ isLegacy: false, expiryBasis: "NOT_TRACKED" })).toBe(false);
  });
});

describe("FEFO ordering (AC 7)", () => {
  const day = (d: string) => new Date(`${d}T00:00:00Z`);

  it("orders by earliest expiry, no expiry last, then received date, then lot", () => {
    const batches = [
      { lotNumber: "NOEXP", expiresOn: null, receivedAt: day("2026-01-01") },
      { lotNumber: "LATE", expiresOn: "2028-01-31", receivedAt: day("2026-01-01") },
      { lotNumber: "B", expiresOn: "2027-06-30", receivedAt: day("2026-03-01") },
      { lotNumber: "A2", expiresOn: "2027-06-30", receivedAt: day("2026-02-01") },
      { lotNumber: "A1", expiresOn: "2027-06-30", receivedAt: day("2026-02-01") },
    ];
    expect([...batches].sort(compareFefo).map((b) => b.lotNumber)).toEqual(["A1", "A2", "B", "LATE", "NOEXP"]);
  });
});

describe("batch schemas", () => {
  const base = {
    batchId: "01a1630a-246c-70a6-a2c6-881fdcc145c8",
    version: 1,
    reason: "Counted and checked",
    expiryOutcome: "UNKNOWN",
  };

  it("never defaults a check result: an empty choice is required", () => {
    const result = batchVerificationSchema.safeParse({ ...base, physicalCheckOk: "", labelCheckOk: "PASS" });
    expect(result.success).toBe(false);
  });

  it("requires a destination when a check fails", () => {
    const result = batchVerificationSchema.safeParse({ ...base, physicalCheckOk: "FAIL", labelCheckOk: "PASS" });
    expect(result.success).toBe(false);
    const ok = batchVerificationSchema.parse({
      ...base,
      physicalCheckOk: "FAIL",
      labelCheckOk: "PASS",
      onFailure: "QUARANTINED",
    });
    expect(ok).toMatchObject({ physicalCheckOk: false, labelCheckOk: true, onFailure: "QUARANTINED" });
  });

  it("requires a date only for the label-date outcome, and refuses one otherwise", () => {
    const checks = { physicalCheckOk: true, labelCheckOk: true };
    expect(batchVerificationSchema.safeParse({ ...base, ...checks, expiryOutcome: "DATE" }).success).toBe(false);
    expect(
      batchVerificationSchema.safeParse({ ...base, ...checks, expiryOutcome: "UNKNOWN", expiresOn: "2027-01" }).success,
    ).toBe(false);
    expect(
      batchVerificationSchema.parse({ ...base, ...checks, expiryOutcome: "DATE", expiresOn: "2027-01" }).expiresOn,
    ).toEqual({ date: "2027-01-31", precision: "MONTH" });
  });

  it("normalises the lot number and refuses a month-only manufacturing date on opening balances", () => {
    const common = {
      variantCode: "ROI-100",
      warehouseId: "01a1630a-246c-70a6-a2c6-881fdcc145c8",
      status: "SELLABLE",
      quantity: "5",
      unitCost: "10",
      reason: "Go-live count",
    };
    expect(openingBalanceSchema.parse({ ...common, lotNumber: " l-1 " }).lotNumber).toBe("L-1");
    expect(openingBalanceSchema.safeParse({ ...common, manufacturedOn: "2026-01" }).success).toBe(false);
    expect(openingBalanceSchema.safeParse({ ...common, lotNumber: "L_1" }).success).toBe(false);
  });

  it("defaults the expiring window to 90 days (DR-006)", () => {
    expect(batchListQuerySchema.parse({ expiry: "expiring" })).toMatchObject({ expiry: "expiring", days: 90 });
    expect(batchListQuerySchema.parse({ incomplete: "1" }).incomplete).toBe(true);
  });
});
