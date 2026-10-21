import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Price with an optional struck-through compare-at price. Amounts are exact decimal strings. */
export function Price({
  amount,
  compareAt,
  currency,
  locale,
  minorUnits = 2,
  className,
}: {
  amount: string;
  compareAt?: string | null;
  currency: string;
  locale: string;
  minorUnits?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="font-semibold tabular-nums" data-testid="price">
        {formatMoney(amount, currency, locale, minorUnits)}
      </span>
      {compareAt ? (
        <span className="text-sm text-muted-foreground tabular-nums line-through">
          {formatMoney(compareAt, currency, locale, minorUnits)}
        </span>
      ) : null}
    </span>
  );
}
