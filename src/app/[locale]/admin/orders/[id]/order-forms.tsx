"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import {
  cancelOrderSchema,
  confirmOrderSchema,
  type CancelOrderInput,
  type ConfirmOrderInput,
} from "@/lib/schemas/orders";
import { cancelOrderAction, confirmOrderAction } from "../actions";

// The version is the one the page was rendered with; the page re-renders after
// each decision, so a stale tab gets a conflict instead of overwriting.

/** Confirm a reviewed order, fixing the delivery fee (0 = free delivery). It does not mark anything paid. */
export function ConfirmOrderForm({
  orderId,
  version,
  currencyCode,
  disabled,
}: {
  orderId: string;
  version: number;
  currencyCode: string;
  disabled?: boolean;
}) {
  const t = useTranslations("orders");
  const common = useTranslations("common");
  const form = useForm<ConfirmOrderInput>({
    resolver: formResolver(confirmOrderSchema),
    defaultValues: { orderId, version, shippingFee: "" },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    await submit(() => confirmOrderAction({ ...values, version }), t("confirmed"));
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" data-testid="order-confirm-form">
      <TextInput
        form={form}
        name="shippingFee"
        label={t("fields.shippingFee", { currency: currencyCode })}
        description={t("fields.shippingFeeHint")}
        required
        dir="ltr"
        inputMode="decimal"
        disabled={disabled}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={disabled || form.formState.isSubmitting} data-testid="order-confirm-submit">
          {form.formState.isSubmitting ? common("saving") : t("confirm")}
        </Button>
      </div>
    </form>
  );
}

/** Cancel with a reason, after an explicit confirmation; reserved stock is released. */
export function CancelOrderForm({ orderId, version }: { orderId: string; version: number }) {
  const t = useTranslations("orders");
  const common = useTranslations("common");
  const form = useForm<CancelOrderInput>({
    resolver: formResolver(cancelOrderSchema),
    defaultValues: { orderId, version, reason: "" },
  });
  const submit = useActionSubmit(form.setError);
  const [pending, setPending] = useState<CancelOrderInput | null>(null);
  const [applying, startApplying] = useTransition();
  const onSubmit = form.handleSubmit((values) => setPending(values));
  const apply = () =>
    startApplying(async () => {
      if (!pending) return;
      await submit(() => cancelOrderAction({ ...pending, version }), t("cancelled"));
      setPending(null);
    });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" data-testid="order-cancel-form">
      <TextAreaInput form={form} name="reason" label={t("fields.cancelReason")} required />
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={applying} data-testid="order-cancel-submit">
          {t("cancel")}
        </Button>
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !applying && setPending(null)}>
        <AlertDialogContent data-testid="order-cancel-confirm">
          <AlertDialogTitle>{t("cancelDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cancelDialog.effect")}</AlertDialogDescription>
          {pending?.reason ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{t("fields.cancelReason")}: </span>
              {pending.reason}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={applying}>{common("cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              type="button"
              disabled={applying}
              onClick={apply}
              data-testid="order-cancel-apply"
            >
              {applying ? common("saving") : t("cancel")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
