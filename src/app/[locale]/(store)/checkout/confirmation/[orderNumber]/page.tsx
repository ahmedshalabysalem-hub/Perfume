import { CheckCircle2, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { formatMoney } from "@/lib/money";
import { EG_GOVERNORATES } from "@/lib/schemas/checkout";
import { localized } from "@/lib/utils";
import { getOrderConfirmation } from "@/server/modules/orders/checkout.service";
import { ORDER_ACCESS_COOKIE, readOrderAccessTokens } from "../../../order-access";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/checkout/confirmation/[orderNumber]">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "store.confirmation" });
  // Never indexed, and the order number is not passed on to other sites.
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function OrderConfirmationPage({
  params,
}: PageProps<"/[locale]/checkout/confirmation/[orderNumber]">) {
  const locale = await initLocale(params);
  const { orderNumber } = await params;
  const t = await getTranslations("store.confirmation");
  const cart = await getTranslations("store.cart");
  const statuses = await getTranslations("orderStatus");
  const payments = await getTranslations("paymentStatus");
  const variantText = await getTranslations("variants");
  const productText = await getTranslations("store.product");
  const tokens = readOrderAccessTokens((await cookies()).get(ORDER_ACCESS_COOKIE)?.value);
  const order = await getOrderConfirmation(decodeURIComponent(orderNumber), tokens);

  if (!order) {
    // Same answer whether the order does not exist or this browser may not see it.
    return (
      <div
        className="mx-auto grid max-w-xl justify-items-center gap-4 px-4 py-20 text-center"
        data-testid="confirmation-missing"
      >
        <h1 className="font-display text-3xl">{t("missingTitle")}</h1>
        <p className="text-muted-foreground">{t("missingBody")}</p>
        <Link href="/products" className={buttonVariants({ variant: "outline" })}>
          {cart("continueShopping")}
        </Link>
      </div>
    );
  }

  const money = (amount: string) => formatMoney(amount, order.currencyCode, locale, order.minorUnits);
  const region =
    order.countryCode === "EG"
      ? EG_GOVERNORATES.find((governorate) => governorate.code === order.shipRegion)?.[locale === "ar" ? "ar" : "en"]
      : order.shipRegion;
  const address = [
    order.shipStreet,
    order.shipBuildingNumber ? t("building", { number: order.shipBuildingNumber }) : null,
    order.shipUnit,
    order.shipDistrict,
    order.shipCity,
    region,
    order.shipPostalCode,
    order.shipShortAddress,
    order.shipAdditional,
  ].filter(Boolean);
  const country = new Intl.DisplayNames([locale], { type: "region" }).of(order.countryCode);
  const placedAt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: order.countryCode === "EG" ? "Africa/Cairo" : "Asia/Riyadh",
  }).format(order.placedAt);
  const storeName = localized(locale, order.store.nameAr, order.store.nameEn);

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-4 py-10 sm:px-6" data-testid="order-confirmation">
      <header className="grid justify-items-center gap-3 text-center">
        <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="max-w-lg text-muted-foreground">{t("intro", { name: order.customerName })}</p>
      </header>

      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2" aria-label={t("orderDetails")}>
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{t("orderNumber")}</p>
          <p className="font-mono text-2xl font-semibold" dir="ltr" data-testid="order-number">
            {order.orderNumber}
          </p>
          <p className="text-xs text-muted-foreground">{t("keepNumber")}</p>
        </div>
        <dl className="grid content-start gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t("placedAt")}</dt>
            <dd>{placedAt}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t("status")}</dt>
            <dd>
              <Badge variant="outline" data-testid="order-status">
                {statuses(order.status)}
              </Badge>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{t("payment")}</dt>
            <dd>
              <Badge variant="outline" data-testid="payment-status">
                {payments(order.paymentStatus)}
              </Badge>
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="grid gap-2 rounded-2xl border border-gold/30 bg-gold/5 p-5 text-sm"
        aria-labelledby="next-heading"
      >
        <h2 id="next-heading" className="font-display text-xl">
          {t("nextHeading")}
        </h2>
        <p data-testid="next-steps">{t("nextBody", { phone: order.customerPhoneMasked })}</p>
        <p className="text-muted-foreground">{t("noPayment")}</p>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-card p-5" aria-labelledby="items-heading">
        <h2 id="items-heading" className="font-display text-xl">
          {t("itemsHeading")}
        </h2>
        <ul className="divide-y" data-testid="confirmation-lines">
          {order.items.map((item) => {
            const size =
              localized(locale, item.variantNameAr ?? "", item.variantNameEn ?? "") ||
              (item.sizeMl ? variantText("ml", { size: item.sizeMl.replace(/\.0+$/, "") }) : "");
            return (
              <li key={item.lineNo} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <div className="grid gap-0.5">
                  <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
                    {localized(locale, item.brandNameAr, item.brandNameEn)}
                  </p>
                  <p className="font-medium">{localized(locale, item.productNameAr, item.productNameEn)}</p>
                  <p className="text-muted-foreground">
                    {[size, item.isTester ? productText("tester") : null].filter(Boolean).join(" · ")}
                    {" · "}
                    {t("quantityTimesPrice", { quantity: item.quantity, price: money(item.unitPrice) })}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">{money(item.lineTotal)}</p>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-2 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{cart("subtotal")}</dt>
            <dd className="font-semibold tabular-nums" data-testid="confirmation-subtotal">
              {money(order.subtotal)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{cart("shipping")}</dt>
            <dd className="text-end">{order.shippingFee ? money(order.shippingFee) : cart("shippingLater")}</dd>
          </div>
          {order.total ? (
            <div className="flex justify-between gap-4 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd className="tabular-nums">{money(order.total)}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-xs text-muted-foreground">
          {order.pricesIncludeTax ? cart("pricesIncludeTax") : cart("pricesExcludeTax")}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2 rounded-2xl border bg-card p-5 text-sm">
          <h2 className="font-display text-xl">{t("deliveryHeading")}</h2>
          <p>{order.customerName}</p>
          <p className="text-muted-foreground" dir="ltr">
            {order.customerPhoneMasked}
          </p>
          <p className="leading-relaxed">{address.join(locale === "ar" ? "، " : ", ")}</p>
          <p className="text-muted-foreground">{country}</p>
        </div>
        <div className="grid content-start gap-2 rounded-2xl border bg-card p-5 text-sm">
          <h2 className="font-display text-xl">{t("contactHeading")}</h2>
          <p>{t("contactBody", { store: storeName })}</p>
          {order.store.phone ? (
            <p className="flex items-center gap-2" dir="ltr">
              <Phone className="size-4 text-gold" aria-hidden="true" />
              <a href={`tel:${order.store.phone}`} className="hover:underline">
                {order.store.phone}
              </a>
            </p>
          ) : null}
          {order.store.email ? (
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-gold" aria-hidden="true" />
              <a href={`mailto:${order.store.email}`} className="hover:underline">
                {order.store.email}
              </a>
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex justify-center">
        <Link href="/products" className={buttonVariants({ variant: "gold", size: "lg" })}>
          {cart("continueShopping")}
        </Link>
      </div>
    </div>
  );
}
