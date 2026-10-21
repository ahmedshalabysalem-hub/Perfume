"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/server/actions/result";

/**
 * A button that asks for confirmation (optionally with a reason) and then
 * runs a Server Action. Used for destructive or sensitive operations.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  action,
  withReason = false,
  variant = "outline",
  size = "sm",
  testId,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  action: (reason: string | null) => Promise<ActionResult<unknown>>;
  withReason?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  testId?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = useActionSubmit();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} data-testid={testId}>
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {withReason ? (
          <label className="grid gap-1.5 text-sm font-medium">
            {t("reasonLabel")}
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("reasonPlaceholder")} maxLength={500} />
          </label>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={pending}
            data-testid={testId ? `${testId}-confirm` : undefined}
            onClick={() =>
              startTransition(async () => {
                const result = await submit(() => action(reason.trim() || null), successMessage);
                if (result !== null) {
                  setOpen(false);
                  setReason("");
                }
              })
            }
          >
            {pending ? t("saving") : confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
