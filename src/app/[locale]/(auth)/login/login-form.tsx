"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, fieldAria } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";
import { signInSchema } from "@/lib/schemas/access";
import type { z } from "@/lib/validation/zod";

type Values = z.input<typeof signInSchema>;

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const errors = useTranslations("errors");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const fieldErrors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
        rememberMe: false,
      });
      if (error) {
        setFormError(error.status === 429 ? errors("rateLimited") : t("invalidCredentials"));
        form.setValue("password", "");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setFormError(errors("network"));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="login-form">
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      <Field id="email" label={t("email")} error={fieldErrors.email?.message} required>
        <Input
          type="email"
          autoComplete="username"
          inputMode="email"
          dir="ltr"
          {...fieldAria("email", fieldErrors.email?.message)}
          {...form.register("email")}
        />
      </Field>
      <Field id="password" label={t("password")} error={fieldErrors.password?.message} required>
        <Input
          type="password"
          autoComplete="current-password"
          dir="ltr"
          {...fieldAria("password", fieldErrors.password?.message)}
          {...form.register("password")}
        />
      </Field>
      <Button type="submit" variant="default" size="lg" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
