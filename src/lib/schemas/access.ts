import { vmsg, z } from "@/lib/validation/zod";
import { requiredText, uuid } from "./fields";

const PASSWORD_MAX = 128;

export const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX),
    newPassword: z.string().min(1).max(PASSWORD_MAX),
    confirmPassword: z.string().min(1).max(PASSWORD_MAX),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    error: vmsg("passwordMismatch"),
  });

export const scopeTypeValues = ["GLOBAL", "COUNTRY", "LEGAL_ENTITY", "STORE", "WAREHOUSE"] as const;

/** A role assignment request. Exactly the target matching `scopeType` is used. */
export const roleAssignmentSchema = z
  .object({
    roleId: uuid(),
    scopeType: z.enum(scopeTypeValues),
    countryCode: z.string().trim().toUpperCase().optional().nullable(),
    legalEntityId: z.string().trim().optional().nullable(),
    storeId: z.string().trim().optional().nullable(),
    warehouseId: z.string().trim().optional().nullable(),
  })
  .superRefine((value, context) => {
    const required: Record<(typeof scopeTypeValues)[number], keyof typeof value | null> = {
      GLOBAL: null,
      COUNTRY: "countryCode",
      LEGAL_ENTITY: "legalEntityId",
      STORE: "storeId",
      WAREHOUSE: "warehouseId",
    };
    const field = required[value.scopeType];
    if (!field) return;
    const target = value[field];
    const valid =
      field === "countryCode"
        ? typeof target === "string" && /^[A-Z]{2}$/.test(target)
        : typeof target === "string" && z.uuid().safeParse(target).success;
    if (!valid) context.addIssue({ code: "custom", path: [field], message: vmsg("invalidReference") });
  });

export const createStaffUserSchema = z.object({
  name: requiredText(120),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  temporaryPassword: z.string().min(1).max(PASSWORD_MAX),
  assignment: roleAssignmentSchema.optional(),
});

export const updateStaffUserSchema = z.object({
  name: requiredText(120),
});

export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(1).max(PASSWORD_MAX),
});

export type RoleAssignmentInput = z.input<typeof roleAssignmentSchema>;
export type CreateStaffUserInput = z.input<typeof createStaffUserSchema>;
