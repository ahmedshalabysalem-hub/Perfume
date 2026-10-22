import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/primitives";
import type { StockStatusValue } from "@/lib/schemas/inventory";
import { localized } from "@/lib/utils";

const VARIANTS = {
  SELLABLE: "success",
  QUARANTINED: "warning",
  DAMAGED: "destructive",
  RETURNED: "secondary",
} as const;

export function StockStatusBadge({ status }: { status: string }) {
  const t = useTranslations("stockStatus");
  const value = status as StockStatusValue;
  return (
    <Badge variant={VARIANTS[value]} data-stock-status={value}>
      {t(value)}
    </Badge>
  );
}

/** Variant label as the catalogue shows it: its own name, else its volume. */
export function VariantName({
  locale,
  variant,
}: {
  locale: string;
  variant: { nameEn: string | null; nameAr: string | null; sizeMl: string | null };
}) {
  const t = useTranslations("variants");
  return (
    localized(locale, variant.nameAr, variant.nameEn) ||
    (variant.sizeMl ? t("ml", { size: Number(variant.sizeMl).toString() }) : null)
  );
}
