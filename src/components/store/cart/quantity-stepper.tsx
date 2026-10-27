"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CART_MAX_QUANTITY } from "@/lib/schemas/checkout";
import { cn } from "@/lib/utils";

/** − n + control for whole quantities between 1 and the cart maximum. */
export function QuantityStepper({
  value,
  onChange,
  label,
  disabled,
  max = CART_MAX_QUANTITY,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  max?: number;
  className?: string;
}) {
  const t = useTranslations("store.cart");
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex h-10 items-center rounded-md border bg-card", className)}
      data-testid="quantity-stepper"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full rounded-e-none"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
        aria-label={t("decrease")}
      >
        <Minus aria-hidden="true" />
      </Button>
      <output
        className="min-w-8 text-center text-sm font-medium tabular-nums"
        aria-live="polite"
        data-testid="quantity"
      >
        {value}
      </output>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full rounded-s-none"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={t("increase")}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
