"use client";

import { AlertCircle, Info, Loader2, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { placeOrderAction } from "@/app/[locale]/(store)/actions";
import { FormErrorText, SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useHydrated } from "@/components/forms/use-hydrated";
import { useTranslateMessage } from "@/components/forms/use-translate-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { Link, useRouter } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import {
  ADDRESS_FIELDS,
  checkoutDetailsSchema,
  type AddressField,
  type CheckoutFormInput,
} from "@/lib/schemas/checkout";
import type { ActionError } from "@/server/actions/result";
import { CartLineImage, LINE_PROBLEM_KEYS, useLineNames, type MarketInfo } from "./cart-line";
import { cartStore, useCartLines } from "./cart-store";
import { usePricedCart } from "./use-priced-cart";

const ATTEMPT_KEY = "perfume.checkout.attempt.v1.";

/**
 * One idempotency key per checkout attempt: resubmitting exactly the same
 * cart and details (double click, retry after a network error, reload)
 * reuses the key, so the server returns the order already placed instead of
 * creating a second one. Any change starts a new attempt.
 */
function attemptKey(market: string, fingerprint: string): string {
  const storageKey = `${ATTEMPT_KEY}${market}`;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as {
      fingerprint?: string;
      key?: string;
    } | null;
    if (stored?.fingerprint === fingerprint && stored.key) return stored.key;
  } catch {
    // Unreadable storage: start a new attempt.
  }
  const key = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  } catch {
    // Without storage the key still covers retries within this page view.
  }
  return key;
}

function forgetAttempt(market: string) {
  try {
    window.sessionStorage.removeItem(`${ATTEMPT_KEY}${market}`);
  } catch {
    // Nothing to forget.
  }
}

const ADDRESS_ORDER: AddressField[] = [
  "region",
  "city",
  "district",
  "street",
  "buildingNumber",
  "unit",
  "postalCode",
  "shortAddress",
  "additional",
];

const EMPTY_FORM: CheckoutFormInput = {
  name: "",
  phone: "",
  email: "",
  region: "",
  city: "",
  district: "",
  street: "",
  buildingNumber: "",
  unit: "",
  postalCode: "",
  shortAddress: "",
  additional: "",
  deliveryNotes: "",
};

export function CheckoutView({
  market,
  governorates,
}: {
  market: MarketInfo;
  governorates: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("store.checkout");
  const cartText = useTranslations("store.cart");
  const locale = useLocale();
  const router = useRouter();
  const hydrated = useHydrated();
  const translate = useTranslateMessage();
  const names = useLineNames();
  const lines = useCartLines(market.code);
  const { priced, current, pending, refresh } = usePricedCart(market.code, lines, hydrated && lines.length > 0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [placed, setPlaced] = useState(false);
  const inFlight = useRef(false);
  const rules = ADDRESS_FIELDS[market.code]!;
  const form = useForm<CheckoutFormInput>({
    resolver: formResolver(checkoutDetailsSchema(market.code)),
    defaultValues: EMPTY_FORM,
    mode: "onTouched",
  });
  const money = (amount: string) => formatMoney(amount, market.currencyCode, locale, market.minorUnits);

  if (!hydrated || (lines.length > 0 && !priced)) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (lines.length === 0 && !placed) {
    return (
      <div
        className="grid justify-items-center gap-4 rounded-2xl border bg-card px-6 py-16 text-center"
        data-testid="checkout-empty"
      >
        <p className="text-lg text-muted-foreground">{t("emptyCart")}</p>
        <Link href="/products" className={buttonVariants({ variant: "gold" })}>
          {cartText("continueShopping")}
        </Link>
      </div>
    );
  }

  const ready = current && !!priced?.canCheckout;

  function reportError(error: ActionError | "network") {
    if (error === "network") {
      setFormError(translate("errors.network"));
      return;
    }
    if (error.messageKey === "errors.checkout.cartChanged") {
      void refresh();
      setFormError(translate(error.messageKey));
      return;
    }
    for (const [path, messages] of Object.entries(error.fieldErrors ?? {})) {
      if (path in EMPTY_FORM && messages[0]) {
        form.setError(path as keyof CheckoutFormInput, { type: "server", message: messages[0] });
      }
    }
    setFormError(translate(error.messageKey, error.params));
  }

  async function submitOrder(values: CheckoutFormInput) {
    // A second click while the first request is running is ignored outright.
    if (inFlight.current || !priced) return;
    inFlight.current = true;
    setSubmitting(true);
    setFormError(undefined);
    const orderLines = priced.lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      expectedUnitPrice: line.unitPrice ?? undefined,
    }));
    const input = {
      idempotencyKey: attemptKey(market.code, JSON.stringify([orderLines, values])),
      locale,
      lines: orderLines,
      details: values,
    };
    try {
      const result = await placeOrderAction(market.code, input);
      if (!result.ok) {
        reportError(result.error);
        return;
      }
      setPlaced(true);
      forgetAttempt(market.code);
      cartStore.clear(market.code);
      router.replace(`/checkout/confirmation/${result.data.orderNumber}`);
    } catch {
      // The order may or may not exist; retrying sends the same key, so it cannot be placed twice.
      reportError("network");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <div className="grid justify-items-center gap-3 py-16" role="status">
        <Loader2 className="size-8 animate-spin text-gold" aria-hidden="true" />
        <p>{t("redirecting")}</p>
      </div>
    );
  }

  const fieldLabel = (field: AddressField) => t(`address.${field}`);
  const hints: Partial<Record<AddressField, string>> = {
    buildingNumber: market.code === "SA" ? t("hints.buildingNumberSa") : undefined,
    shortAddress: t("hints.shortAddress"),
    postalCode: t("hints.postalCode"),
  };

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(submitOrder)(event)}
      noValidate
      className="grid gap-8 lg:grid-cols-[1fr_24rem]"
      data-testid="checkout-form"
    >
      <div className="grid content-start gap-6">
        <fieldset className="grid gap-4 rounded-2xl border bg-card p-5">
          <legend className="px-1 font-display text-2xl">{t("contactHeading")}</legend>
          <TextInput form={form} name="name" label={t("name")} required autoComplete="name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              form={form}
              name="phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              label={t("phone")}
              description={t(market.code === "EG" ? "phoneHintEg" : "phoneHintSa")}
              required
              autoComplete="tel"
            />
            <TextInput
              form={form}
              name="email"
              type="email"
              dir="ltr"
              inputMode="email"
              label={t("email")}
              description={t("emailHint")}
              autoComplete="email"
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border bg-card p-5">
          <legend className="px-1 font-display text-2xl">{t("addressHeading")}</legend>
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
            {t("deliverWithin", { country: market.countryName })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {ADDRESS_ORDER.filter((field) => rules[field] !== "hidden").map((field) =>
              field === "region" ? (
                <SelectInput
                  key={field}
                  form={form}
                  name={field}
                  label={t("address.governorate")}
                  required={rules[field] === "required"}
                  options={governorates}
                  placeholder={t("chooseGovernorate")}
                />
              ) : (
                <TextInput
                  key={field}
                  form={form}
                  name={field}
                  label={fieldLabel(field)}
                  required={rules[field] === "required"}
                  description={hints[field]}
                  className={field === "street" || field === "additional" ? "sm:col-span-2" : undefined}
                  dir={["buildingNumber", "postalCode", "shortAddress"].includes(field) ? "ltr" : undefined}
                  inputMode={field === "buildingNumber" || field === "postalCode" ? "numeric" : undefined}
                  autoComplete={
                    field === "city"
                      ? "address-level2"
                      : field === "street"
                        ? "address-line1"
                        : field === "postalCode"
                          ? "postal-code"
                          : undefined
                  }
                />
              ),
            )}
          </div>
          <TextAreaInput form={form} name="deliveryNotes" label={t("deliveryNotes")} rows={2} />
        </fieldset>

        <section className="grid gap-3 rounded-2xl border bg-card p-5" aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="font-display text-2xl">
            {t("paymentHeading")}
          </h2>
          <p className="flex gap-2 text-sm" data-testid="payment-notice">
            <Lock className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
            {t("paymentNotice")}
          </p>
        </section>
      </div>

      <aside
        aria-labelledby="checkout-summary-heading"
        className="grid content-start gap-4 rounded-2xl border bg-card p-5 lg:sticky lg:top-28"
      >
        <h2 id="checkout-summary-heading" className="font-display text-2xl">
          {t("summaryHeading")}
        </h2>
        <ul className="grid gap-3" data-testid="checkout-lines">
          {(priced?.lines ?? []).map((line) => {
            const label = names(line);
            return (
              <li key={line.variantId} className="flex gap-3 text-sm" data-testid="checkout-line">
                <CartLineImage line={line} size="sm" />
                <div className="grid min-w-0 flex-1 content-start gap-0.5">
                  <p className="font-medium">{label.product || "—"}</p>
                  <p className="text-muted-foreground">
                    {label.variant} · {t("quantityShort", { quantity: line.quantity })}
                  </p>
                  {line.status !== "OK" ? (
                    <p className="text-destructive">
                      {cartText(LINE_PROBLEM_KEYS[line.status], { country: market.countryName })}
                    </p>
                  ) : null}
                </div>
                <p className="font-medium tabular-nums">{line.lineTotal ? money(line.lineTotal) : "—"}</p>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-2 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{cartText("subtotal")}</dt>
            <dd className="font-semibold tabular-nums" data-testid="checkout-subtotal">
              {priced ? money(priced.subtotal) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>{cartText("shipping")}</dt>
            <dd className="text-end">{cartText("shippingLater")}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {market.pricesIncludeTax ? cartText("pricesIncludeTax") : cartText("pricesExcludeTax")}
        </p>
        {!ready && priced && !pending ? (
          <Alert variant="destructive" className="flex gap-2 text-sm" data-testid="checkout-blocked">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {cartText("fixProblems")}{" "}
              <Link href="/cart" className="underline">
                {t("backToCart")}
              </Link>
            </span>
          </Alert>
        ) : null}
        <FormErrorText message={formError} />
        <Button
          type="submit"
          variant="gold"
          size="lg"
          className="w-full"
          disabled={!ready || submitting || pending}
          aria-busy={submitting}
          data-testid="place-order"
        >
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? t("placing") : t("placeOrder")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("reviewNote")}</p>
        <Link href="/cart" className="text-center text-sm text-muted-foreground hover:text-foreground">
          {t("backToCart")}
        </Link>
      </aside>
    </form>
  );
}
