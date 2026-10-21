"use client";

import { KeyRound, Plus, ShieldPlus, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormDialog } from "@/components/admin/form-dialog";
import { SelectInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import {
  createStaffUserSchema,
  resetPasswordSchema,
  roleAssignmentSchema,
  scopeTypeValues,
} from "@/lib/schemas/access";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import {
  assignRoleAction,
  createStaffUserAction,
  resetStaffPasswordAction,
  revokeRoleAssignmentAction,
  setStaffUserStatusAction,
} from "./actions";

export type AssignmentOptions = {
  roles: Array<{ id: string; key: string; nameEn: string; nameAr: string; allowedScopeTypes: string[] }>;
  countries: Array<{ code: string; nameEn: string; nameAr: string }>;
  legalEntities: Array<{ id: string; code: string; legalNameEn: string; legalNameAr: string }>;
  stores: Array<{ id: string; code: string; nameEn: string; nameAr: string }>;
  warehouses: Array<{ id: string; code: string; nameEn: string; nameAr: string }>;
};

/** Random temporary password (crypto-strength), shown once to the administrator. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${chars.slice(0, 6)}-${chars.slice(6, 12)}-${chars.slice(12)}`;
}

type AssignmentValues = z.input<typeof roleAssignmentSchema>;

/** Role + scope pickers shared by "create user" and "assign role". */
function AssignmentFields<T extends { assignment?: AssignmentValues } | AssignmentValues>({
  form,
  prefix,
  options,
  optional,
}: {
  form: UseFormReturn<T>;
  prefix: "" | "assignment.";
  options: AssignmentOptions;
  optional?: boolean;
}) {
  const t = useTranslations("users");
  const scopes = useTranslations("scopes");
  const common = useTranslations("common");
  const locale = useLocale();
  const typed = form as unknown as UseFormReturn<Record<string, unknown>>;
  const roleId = useWatch({ control: typed.control, name: `${prefix}roleId` }) as string | undefined;
  const scopeType = useWatch({ control: typed.control, name: `${prefix}scopeType` }) as string | undefined;
  const role = options.roles.find((candidate) => candidate.id === roleId);
  const allowed = scopeTypeValues.filter((scope) => !role || role.allowedScopeTypes.includes(scope));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectInput
        form={typed}
        name={`${prefix}roleId`}
        label={t("role")}
        required={!optional}
        placeholder={optional ? common("none") : common("selectPlaceholder")}
        options={options.roles.map((candidate) => ({
          value: candidate.id,
          label: localized(locale, candidate.nameAr, candidate.nameEn),
        }))}
      />
      <SelectInput
        form={typed}
        name={`${prefix}scopeType`}
        label={t("scope")}
        required={!optional}
        options={allowed.map((scope) => ({ value: scope, label: scopes(scope) }))}
      />
      {scopeType === "COUNTRY" ? (
        <SelectInput
          form={typed}
          name={`${prefix}countryCode`}
          label={t("scopeTarget")}
          required
          placeholder={common("selectPlaceholder")}
          options={options.countries.map((country) => ({
            value: country.code,
            label: localized(locale, country.nameAr, country.nameEn),
          }))}
        />
      ) : null}
      {scopeType === "LEGAL_ENTITY" ? (
        <SelectInput
          form={typed}
          name={`${prefix}legalEntityId`}
          label={t("scopeTarget")}
          required
          placeholder={common("selectPlaceholder")}
          options={options.legalEntities.map((entity) => ({
            value: entity.id,
            label: `${entity.code} · ${localized(locale, entity.legalNameAr, entity.legalNameEn)}`,
          }))}
        />
      ) : null}
      {scopeType === "STORE" ? (
        <SelectInput
          form={typed}
          name={`${prefix}storeId`}
          label={t("scopeTarget")}
          required
          placeholder={common("selectPlaceholder")}
          options={options.stores.map((store) => ({
            value: store.id,
            label: `${store.code} · ${localized(locale, store.nameAr, store.nameEn)}`,
          }))}
        />
      ) : null}
      {scopeType === "WAREHOUSE" ? (
        <SelectInput
          form={typed}
          name={`${prefix}warehouseId`}
          label={t("scopeTarget")}
          required
          placeholder={common("selectPlaceholder")}
          options={options.warehouses.map((warehouse) => ({
            value: warehouse.id,
            label: `${warehouse.code} · ${localized(locale, warehouse.nameAr, warehouse.nameEn)}`,
          }))}
        />
      ) : null}
    </div>
  );
}

type CreateValues = z.input<typeof createStaffUserSchema>;

export function CreateStaffUserButton({ options }: { options: AssignmentOptions }) {
  const t = useTranslations("users");
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("new")}
        </>
      }
      title={t("createTitle")}
      description={t("createHint")}
      wide
      testId="new-user"
    >
      {(close) => <CreateStaffUserForm options={options} onDone={close} />}
    </FormDialog>
  );
}

function CreateStaffUserForm({ options, onDone }: { options: AssignmentOptions; onDone: () => void }) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  const router = useRouter();
  const form = useForm<CreateValues>({
    resolver: formResolver(createStaffUserSchema),
    defaultValues: { name: "", email: "", temporaryPassword: generatePassword(), assignment: undefined },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const assignment = values.assignment?.roleId ? values.assignment : undefined;
    const result = await submit(() => createStaffUserAction({ ...values, assignment }), t("created"));
    if (result) {
      onDone();
      router.push(`/admin/access/users/${result.id}`);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="create-user-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="name" label={t("name")} required />
        <TextInput form={form} name="email" label={t("email")} required type="email" dir="ltr" />
      </div>
      <div className="flex items-end gap-2">
        <TextInput
          form={form}
          name="temporaryPassword"
          label={t("temporaryPassword")}
          required
          dir="ltr"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => form.setValue("temporaryPassword", generatePassword())}
          aria-label={common("generate")}
        >
          <Wand2 />
        </Button>
      </div>
      <AssignmentFields form={form} prefix="assignment." options={options} optional />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? common("saving") : common("create")}
        </Button>
      </div>
    </form>
  );
}

export function AssignRoleButton({ userId, options }: { userId: string; options: AssignmentOptions }) {
  const t = useTranslations("users");
  return (
    <FormDialog
      trigger={
        <>
          <ShieldPlus /> {t("addAssignment")}
        </>
      }
      title={t("addAssignment")}
      description={t("assignmentsHint")}
      wide
      testId="assign-role"
    >
      {(close) => <AssignRoleForm userId={userId} options={options} onDone={close} />}
    </FormDialog>
  );
}

function AssignRoleForm({
  userId,
  options,
  onDone,
}: {
  userId: string;
  options: AssignmentOptions;
  onDone: () => void;
}) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  const form = useForm<AssignmentValues>({
    resolver: formResolver(roleAssignmentSchema),
    defaultValues: {
      roleId: "",
      scopeType: "GLOBAL",
      countryCode: "",
      legalEntityId: "",
      storeId: "",
      warehouseId: "",
    },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    if ((await submit(() => assignRoleAction(userId, values), t("assigned"))) !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <AssignmentFields form={form} prefix="" options={options} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

export function RevokeAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  return (
    <ConfirmAction
      trigger={t("revokeAssignment")}
      title={common("areYouSure")}
      description={t("revokeConfirm")}
      confirmLabel={t("revokeAssignment")}
      successMessage={t("revoked")}
      variant="destructive"
      action={() => revokeRoleAssignmentAction(assignmentId)}
    />
  );
}

type ResetValues = z.input<typeof resetPasswordSchema>;

export function ResetPasswordButton({ userId }: { userId: string }) {
  const t = useTranslations("users");
  return (
    <FormDialog
      trigger={
        <>
          <KeyRound /> {t("resetPassword")}
        </>
      }
      title={t("resetPassword")}
      description={t("resetPasswordHint")}
      variant="outline"
    >
      {(close) => <ResetPasswordForm userId={userId} onDone={close} />}
    </FormDialog>
  );
}

function ResetPasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  const form = useForm<ResetValues>({
    resolver: formResolver(resetPasswordSchema),
    defaultValues: { temporaryPassword: generatePassword() },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    if ((await submit(() => resetStaffPasswordAction(userId, values), t("passwordReset"))) !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="flex items-end gap-2">
        <TextInput
          form={form}
          name="temporaryPassword"
          label={t("temporaryPassword")}
          required
          dir="ltr"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => form.setValue("temporaryPassword", generatePassword())}
          aria-label={common("generate")}
        >
          <Wand2 />
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? common("saving") : t("resetPassword")}
        </Button>
      </div>
    </form>
  );
}

export function UserStatusButton({
  userId,
  status,
}: {
  userId: string;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  return status === "ACTIVE" ? (
    <ConfirmAction
      trigger={t("deactivate")}
      title={t("deactivate")}
      description={t("deactivateConfirm")}
      confirmLabel={t("deactivate")}
      successMessage={t("statusChanged")}
      variant="destructive"
      size="default"
      withReason
      testId="deactivate-user"
      action={(reason) => setStaffUserStatusAction(userId, "DEACTIVATED", reason)}
    />
  ) : (
    <ConfirmAction
      trigger={t("reactivate")}
      title={t("reactivate")}
      description={common("activateConfirm")}
      confirmLabel={t("reactivate")}
      successMessage={t("statusChanged")}
      size="default"
      action={(reason) => setStaffUserStatusAction(userId, "ACTIVE", reason)}
    />
  );
}
