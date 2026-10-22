import { vmsg, z } from "@/lib/validation/zod";
import { optionalText, optionalUuid, requiredText } from "./fields";

export const APPROVAL_DECISIONS = ["APPROVE", "REJECT"] as const;

/** An approver's decision. Rejections must say why; approvals may. */
export const approvalDecisionSchema = z
  .object({
    decision: z.enum(APPROVAL_DECISIONS),
    reason: optionalText(500),
  })
  .superRefine((value, context) => {
    if (value.decision === "REJECT" && !value.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: vmsg("required") });
    }
  });

export const approvalCancelSchema = z.object({ reason: optionalText(500) });

/** Submitted by module services, never directly by a form. */
export const approvalSubmitSchema = z.object({
  subjectType: requiredText(64),
  subjectId: requiredText(64),
  summary: requiredText(300),
  reason: requiredText(500),
  snapshot: z.unknown().optional(),
  scope: z
    .object({
      countryCode: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullish()
        .transform((value) => value ?? null),
      legalEntityId: optionalUuid(),
      storeId: optionalUuid(),
      warehouseId: optionalUuid(),
    })
    .default({ countryCode: null, legalEntityId: null, storeId: null, warehouseId: null }),
});

export type ApprovalDecisionInput = z.input<typeof approvalDecisionSchema>;
export type ApprovalSubmitInput = z.input<typeof approvalSubmitSchema>;
