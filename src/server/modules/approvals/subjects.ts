import type { PermissionKey } from "@/server/rbac/permissions";

/**
 * Approval policies by subject type. A subject type is owned by the module
 * that submits it; the request permission is checked on submission and the
 * approve permission on decision, both at the request's scope. Adding a
 * subject type is a code change reviewed with its module (ADR-019).
 */
export type ApprovalSubjectPolicy = {
  requestPermission: PermissionKey;
  approvePermission: PermissionKey;
};

export const APPROVAL_SUBJECTS = {
  "inventory.adjustment": {
    requestPermission: "inventory.adjust.request",
    approvePermission: "inventory.adjust.approve",
  },
  "purchases.order": {
    requestPermission: "purchases.create",
    approvePermission: "purchases.approve",
  },
  "payments.refund": {
    requestPermission: "payments.refund.request",
    approvePermission: "payments.refund.approve",
  },
} as const satisfies Record<string, ApprovalSubjectPolicy>;

export type ApprovalSubjectType = keyof typeof APPROVAL_SUBJECTS;

export const APPROVAL_SUBJECT_TYPES = Object.keys(APPROVAL_SUBJECTS) as ApprovalSubjectType[];

export function isApprovalSubjectType(value: string): value is ApprovalSubjectType {
  return Object.hasOwn(APPROVAL_SUBJECTS, value);
}
