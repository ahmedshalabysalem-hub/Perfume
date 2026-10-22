import { describe, expect, it } from "vitest";
import { approvalDecisionSchema, approvalSubmitSchema } from "@/lib/schemas/approvals";
import { approvalTarget } from "@/server/modules/approvals/approvals.service";
import { APPROVAL_SUBJECTS, APPROVAL_SUBJECT_TYPES, isApprovalSubjectType } from "@/server/modules/approvals/subjects";
import { isPermissionKey, PERMISSIONS } from "@/server/rbac/permissions";

describe("approval decision schema", () => {
  it("requires a reason to reject but not to approve", () => {
    expect(approvalDecisionSchema.safeParse({ decision: "APPROVE" }).success).toBe(true);
    const rejection = approvalDecisionSchema.safeParse({ decision: "REJECT", reason: "  " });
    expect(rejection.success).toBe(false);
    expect(rejection.error?.issues[0]?.path).toEqual(["reason"]);
    expect(approvalDecisionSchema.parse({ decision: "REJECT", reason: " Wrong count " }).reason).toBe("Wrong count");
    expect(approvalDecisionSchema.safeParse({ decision: "MAYBE" }).success).toBe(false);
  });

  it("defaults the submission scope to organisation-wide", () => {
    const parsed = approvalSubmitSchema.parse({ subjectType: "a.b", subjectId: "1", summary: "s", reason: "r" });
    expect(parsed.scope).toEqual({ countryCode: null, legalEntityId: null, storeId: null, warehouseId: null });
  });
});

describe("approval subjects", () => {
  it("use existing, distinct request and approve permissions; approve permissions are sensitive", () => {
    for (const type of APPROVAL_SUBJECT_TYPES) {
      const policy = APPROVAL_SUBJECTS[type];
      expect(isPermissionKey(policy.requestPermission)).toBe(true);
      expect(isPermissionKey(policy.approvePermission)).toBe(true);
      expect(policy.requestPermission).not.toBe(policy.approvePermission);
      expect(PERMISSIONS.find((permission) => permission.key === policy.approvePermission)?.sensitive).toBe(true);
      // Same shape as the subject_type CHECK in the migration.
      expect(type).toMatch(/^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/);
    }
    expect(isApprovalSubjectType("toString")).toBe(false);
  });
});

describe("approvalTarget", () => {
  it("maps scope columns to an authorisation target", () => {
    const none = { countryCode: null, legalEntityId: null, storeId: null, warehouseId: null };
    expect(approvalTarget(none)).toBe("global");
    expect(approvalTarget({ ...none, countryCode: "SA", warehouseId: "w" })).toEqual({
      countryCode: "SA",
      warehouseId: "w",
    });
  });
});
