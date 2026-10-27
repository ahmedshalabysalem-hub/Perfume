"use client";

import { AlertCircle, Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTranslateMessage } from "@/components/forms/use-translate-message";
import { useHydrated } from "@/components/forms/use-hydrated";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { Link, useRouter } from "@/i18n/navigation";
import { formatMoney, multiplyMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PricedCartLine } from "@/server/modules/orders/cart.service";
import { CartLineImage, LINE_PROBLEM_KEYS, useLineNames, type MarketInfo } from "./cart-line";
import { cartStore, useCartLines } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";
import { usePricedCart } from "./use-priced-cart";

export function CartView({ market }: { market: MarketInfo }) {
  const t = useTranslations("store.cart");
  const locale = useLocale();
  const hydrated = useHydrated();
  const lines = useCartLines(market.code);
  const { priced, current, pending, error, refresh } = usePricedCart(market.code, lines, hydrated && lines.length > 0);
  const translate = useTranslateMessage();
  const router = useRouter();
  const names = useLineNames();
  const money = (amount: string) => formatMoney(amount, market.currencyCode, locale, market.minorUnits);

  if (!hydrated) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (lines.length === 0) {
    return (
      <div
        className="grid justify-items-center gap-4 rounded-2xl border bg-card px-6 py-16 text-center"
        data-testid="cart-empty"
      >
        <ShoppingBag className="size-10 text-gold" aria-hidden="true" />
        <h2 className="font-display text-2xl">{t("emptyTitle")}</h2>
        <p className="max-w-sm text-muted-foreground">{t("emptyBody")}</p>
        <Link href="/products" className={buttonVariants({ variant: "gold", size: "lg" })}>
          {t("continueShopping")}
        </Link>
      </div>
    );
  }

  const info = new Map((priced?.lines ?? []).map((line) => [line.variantId, line]));
  const rows = lines.map((line) => {
    const known = info.get(line.variantId);
    const lineTotal = known?.unitPrice ? multiplyMoney(known.unitPrice, line.quantity, market.minorUnits) : null;
    return { line, known, lineTotal };
  });
  const purchasable = rows.filter((row) => row.known?.status === "OK" && row.lineTotal);
  const subtotal = sumMoney(
    purchasable.map((row) => row.lineTotal!),
    market.minorUnits,
  );
  const canCheckout = current && !!priced?.canCheckout && !pending && !error;
  const hasProblems = rows.some((row) => row.known && row.known.status !== "OK");
  const marketChanged = error !== null && error !== "network" && error.messageKey === "errors.checkout.marketChanged";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="cart-items-heading" className="grid content-start gap-4">
        <h2 id="cart-items-heading" className="sr-only">
          {t("itemsHeading")}
        </h2>
        {error ? (
          <Alert variant="destructive" className="flex flex-wrap items-center gap-3">
            <AlertCircle className="size-4" aria-hidden="true" />
            <span className="flex-1">
              {error === "network" ? translate("errors.network") : translate(error.messageKey, error.params)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => (marketChanged ? router.refresh() : void refresh())}
            >
              {t("retry")}
            </Button>
          </Alert>
        ) : null}
        <ul className="divide-y rounded-2xl border bg-card" data-testid="cart-lines">
          {rows.map(({ line, known, lineTotal }) => (
            <li
              key={line.variantId}
              className="flex gap-4 p-4"
              data-testid="cart-line"
              data-variant-id={line.variantId}
            >
              {known ? <CartLineImage line={known} /> : <Skeleton className="size-20 shrink-0 sm:size-24" />}
              <div className="grid min-w-0 flex-1 gap-2">
                {known ? <LineHeading line={known} names={names} /> : <Skeleton className="h-5 w-40" />}
                {known?.unitPrice ? (
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {t("unitPrice", { price: money(known.unitPrice) })}
                  </p>
                ) : null}
                {known && known.status !== "OK" ? (
                  <p
                    className="flex items-start gap-1.5 text-sm text-destructive"
                    role="status"
                    data-testid="line-problem"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t(LINE_PROBLEM_KEYS[known.status], { country: market.countryName })}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {known?.status !== "UNAVAILABLE" ? (
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(quantity) => cartStore.setQuantity(market.code, line.variantId, quantity)}
                        label={t("quantityFor", { name: known ? names(known).product : "" })}
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => cartStore.remove(market.code, line.variantId)}
                      data-testid="remove-line"
                    >
                      <Trash2 aria-hidden="true" />
                      {t("remove")}
                    </Button>
                  </div>
                  {lineTotal ? (
                    <p className="font-semibold tabular-nums" data-testid="line-total">
                      {money(lineTotal)}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Link
          href="/products"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("continueShopping")}
        </Link>
      </section>

      <aside
        aria-labelledby="cart-summary-heading"
        className="grid content-start gap-4 rounded-2xl border bg-card p-5 lg:sticky lg:top-28"
      >
        <h2 id="cart-summary-heading" className="font-display text-2xl">
          {t("summary")}
        </h2>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{t("subtotal")}</dt>
            <dd className="font-semibold tabular-nums" data-testid="cart-subtotal">
              {priced ? money(subtotal) : <Skeleton className="h-5 w-20" />}
            </dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>{t("shipping")}</dt>
            <dd className="text-end">{t("shippingLater")}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {market.pricesIncludeTax ? t("pricesIncludeTax") : t("pricesExcludeTax")}
        </p>
        {hasProblems ? (
          <p className="text-sm text-destructive" data-testid="cart-blocked">
            {t("fixProblems")}
          </p>
        ) : null}
        {canCheckout ? (
          <Link
            href="/checkout"
            className={cn(buttonVariants({ variant: "gold", size: "lg" }), "w-full")}
            data-testid="go-to-checkout"
          >
            {t("checkout")}
          </Link>
        ) : (
          <Button type="button" variant="gold" size="lg" className="w-full" disabled data-testid="go-to-checkout">
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t("checkout")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t("noPaymentNote")}</p>
      </aside>
    </div>
  );
}

function LineHeading({ line, names }: { line: PricedCartLine; names: ReturnType<typeof useLineNames> }) {
  const label = names(line);
  return (
    <div className="grid gap-0.5">
      {label.brand ? (
        <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">{label.brand}</p>
      ) : null}
      {line.productSlug ? (
        <Link
          href={{ pathname: `/products/${line.productSlug}`, query: { v: line.variantId } }}
          className="font-medium hover:text-gold"
          data-testid="line-name"
        >
          {label.product}
        </Link>
      ) : (
        <p className="font-medium text-muted-foreground" data-testid="line-name">
          {label.product || "—"}
        </p>
      )}
      {label.variant ? <p className="text-sm text-muted-foreground">{label.variant}</p> : null}
    </div>
  );
}
