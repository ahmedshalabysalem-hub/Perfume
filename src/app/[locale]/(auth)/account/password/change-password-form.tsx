"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Field, fieldAria } from "@/components/forms/field";
import { useHydrated } from "@/components/forms/use-hydrated";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { changePasswordSchema } from "@/lib/schemas/access";
import type { z } from "@/lib/validation/zod";
import { changePasswordAction } from "../../actions";

type Values = z.input<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const submit = useActionSubmit(form.setError);
  const hydrated = useHydrated();
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submit(() => changePasswordAction(values), t("passwordChanged"));
    if (result !== null) {
      form.reset();
      router.replace("/admin");
      router.refresh();
    }
  });

  return (
    // method="post" keeps passwords out of the URL even on a native submission.
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="change-password-form">
      <Field id="currentPassword" label={t("currentPassword")} error={errors.currentPassword?.message} required>
        <Input
          type="password"
          autoComplete="current-password"
          dir="ltr"
          {...fieldAria("currentPassword", errors.currentPassword?.message)}
          {...form.register("currentPassword")}
        />
      </Field>
      <Field
        id="newPassword"
        label={t("newPassword")}
        error={errors.newPassword?.message}
        description={t("passwordPolicy")}
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          dir="ltr"
          {...fieldAria("newPassword", errors.newPassword?.message, true)}
          {...form.register("newPassword")}
        />
      </Field>
      <Field id="confirmPassword" label={t("confirmPassword")} error={errors.confirmPassword?.message} required>
        <Input
          type="password"
          autoComplete="new-password"
          dir="ltr"
          {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
          {...form.register("confirmPassword")}
        />
      </Field>
      <Button type="submit" disabled={!hydrated || form.formState.isSubmitting} data-testid="change-password-submit">
        {form.formState.isSubmitting ? common("saving") : common("save")}
      </Button>
    </form>
  );
}
