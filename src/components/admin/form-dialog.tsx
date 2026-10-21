"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Dialog that hosts a form. The form receives `close` so it can dismiss the
 * dialog after a successful save.
 */
export function FormDialog({
  trigger,
  title,
  description,
  children,
  variant = "default",
  size = "default",
  wide = false,
  testId,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  wide?: boolean;
  testId?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} data-testid={testId}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("close")} className={cn(wide && "max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {open ? children(() => setOpen(false)) : null}
      </DialogContent>
    </Dialog>
  );
}
