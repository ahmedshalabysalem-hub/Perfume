"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useTranslateMessage } from "./use-translate-message";

type FieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  description?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

/** Label + control + description + translated error, wired for screen readers. */
export function Field({ id, label, error, description, required, className, children }: FieldProps) {
  const translate = useTranslateMessage();
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {description ? (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {translate(error)}
        </p>
      ) : null}
    </div>
  );
}

/** ARIA attributes for a control rendered inside <Field>. */
export function fieldAria(id: string, error?: string, hasDescription = false) {
  const describedBy = [hasDescription ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

export function CheckboxField({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="pt-0.5">{children}</div>
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm leading-tight font-medium">
          {label}
        </label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
