import { AlertTriangle, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { formatMoney } from "@/lib/money";
import { EG_GOVERNORATES } from "@/lib/schemas/checkout";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { getOrder } from "@/server/modules/orders/orders.service";
import { OrderStatusBadge, PaymentStatusBadge } from "../order-badges";
import { CancelOrderForm, ConfirmOrderForm } from "./order-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/orders/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "orders" });
  return { title: t("detailTitle") };
}

export default async function OrderPage({ params }: PageProps<"/[locale]/admin/orders/[id]">) {
  const locale = await initLocale(params);
  const { id } = await params;
  const actor = await getAdminPageActor("orders.view");
  if (!actor) return <NoAccess />;
  const order = await getOrder({ actor, meta: await getRequestMeta() }, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const t = await getTranslations("orders");
  const statuses = await getTranslations("orderStatus");
  const checkout = await getTranslations("store.checkout");
  const variantText = await getTranslations("variants");
  const format = await getFormatter();
  const money = (amount: string) => formatMoney(amount, order.currencyCode, locale, order.minorUnits);
  const blocked = new Set(order.ineligibleReservationIds);
  const reservationsByItem = new Map<string, typeof order.reservations>();
  for (const reservation of order.reservations) {
    reservationsByItem.set(reservation.orderItemId, [
      ...(reservationsByItem.get(reservation.orderItemId) ?? []),
      reservation,
    ]);
  }
  const address = order.address;
  const regionName =
    address?.region && order.countryCode === "EG"
      ? (EG_GOVERNORATES.find((governorate) => governorate.code === address.region)?.[locale === "ar" ? "ar" : "en"] ??
        address.region)
      : address?.region;
  const addressRows = address
    ? (
        [
          ["governorate", regionName],
          ["city", address.city],
          ["district", address.district],
          ["street", address.street],
          ["buildingNumber", address.buildingNumber],
          ["unit", address.unit],
          ["postalCode", address.postalCode],
          ["shortAddress", address.shortAddress],
          ["additional", address.additional],
        ] as const
      ).filter(([, value]) => !!value)
    : [];

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t("title")}
      </Link>
      <PageHeader
        className="mb-0"
        title={
          <span className="ltr-value font-mono" data-testid="order-number">
            {order.orderNumber}
          </span>
        }
        description={t("placedOn", {
          date: format.dateTime(order.placedAt, "long"),
          store: localized(locale, order.store.nameAr, order.store.nameEn),
        })}
        actions={
          <>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
            {order.isGuest ? <Badge variant="outline">{t("guest")}</Badge> : null}
          </>
        }
      />

      {order.status === "PENDING_REVIEW" && order.reviewDueAt ? (
        <Alert variant="info" data-testid="review-due">
          {t("reviewDue", { date: format.dateTime(order.reviewDueAt, "long") })}
        </Alert>
      ) : null}
      {blocked.size > 0 ? (
        <Alert variant="warning" className="flex gap-2" data-testid="reservation-blocked">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("reservationBlocked")}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("itemsHeading")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.product")}</TableHead>
                    <TableHead className="text-end">{t("columns.quantity")}</TableHead>
                    <TableHead className="text-end">{t("columns.unitPrice")}</TableHead>
                    <TableHead className="text-end">{t("columns.lineTotal")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const size =
                      localized(locale, item.variantNameAr ?? "", item.variantNameEn ?? "") ||
                      (item.sizeMl ? variantText("ml", { size: item.sizeMl.replace(/\.0+$/, "") }) : "");
                    return (
                      <TableRow key={item.id} data-testid="order-item" data-sku={item.sku}>
                        <TableCell>
                          <span className="block font-medium">
                            {localized(locale, item.productNameAr, item.productNameEn)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {[
                              localized(locale, item.brandNameAr, item.brandNameEn),
                              size,
                              item.isTester ? t("tester") : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <span className="ltr-value block font-mono text-xs text-muted-foreground">{item.sku}</span>
                          <ul className="mt-1 grid gap-0.5 text-xs" data-testid="item-reservations">
                            {(reservationsByItem.get(item.id) ?? []).map((reservation) => (
                              <li
                                key={reservation.id}
                                className={blocked.has(reservation.id) ? "text-warning" : "text-muted-foreground"}
                              >
                                {t(`reservation.${reservation.status}`, { quantity: reservation.quantity })}
                                {reservation.batch ? (
                                  <>
                                    {" · "}
                                    <Link
                                      href={`/admin/inventory/batches/${reservation.batch.id}`}
                                      className="ltr-value font-mono hover:underline"
                                    >
                                      {reservation.batch.lotNumber ?? t("legacyLot")}
                                    </Link>
                                    {reservation.batch.expiresOn ? (
                                      <>
                                        {" · "}
                                        {t("expires")} <bdi className="ltr-value">{reservation.batch.expiresOn}</bdi>
                                      </>
                                    ) : null}
                                  </>
                                ) : null}
                                {blocked.has(reservation.id) ? ` · ${t("notSellable")}` : null}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-end whitespace-nowrap tabular-nums">
                          {money(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-end whitespace-nowrap tabular-nums">
                          {money(item.lineTotal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <dl className="grid gap-1 justify-self-end text-sm sm:min-w-64">
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">{t("subtotal")}</dt>
                  <dd className="tabular-nums" data-testid="order-subtotal">
                    {money(order.subtotal)}
                  </dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">{t("shippingFee")}</dt>
                  <dd className="tabular-nums">{order.shippingFee ? money(order.shippingFee) : t("notSet")}</dd>
                </div>
                <div className="flex justify-between gap-6 font-semibold">
                  <dt>{t("total")}</dt>
                  <dd className="tabular-nums" data-testid="order-total">
                    {order.total ? money(order.total) : t("notSet")}
                  </dd>
                </div>
                <p className="text-xs text-muted-foreground">
                  {order.pricesIncludeTax ? t("pricesIncludeTax") : t("pricesExcludeTax")}
                </p>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("historyHeading")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm" data-testid="order-history">
                {order.history.map((entry) => (
                  <li key={entry.id} className="grid gap-0.5">
                    <span>
                      <span className="font-medium">{statuses(entry.toStatus)}</span>
                      {" · "}
                      <span className="text-muted-foreground">
                        <bdi>{entry.actorName ?? (entry.actorType === "SYSTEM" ? t("system") : "—")}</bdi> ·{" "}
                        <bdi>{format.dateTime(entry.occurredAt, "long")}</bdi>
                      </span>
                    </span>
                    {entry.reason ? (
                      <span className="text-muted-foreground">
                        {entry.actorType === "SYSTEM"
                          ? t(entry.toStatus === "PENDING_REVIEW" ? "systemReason.placed" : "systemReason.expired")
                          : entry.reason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("customerHeading")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm" data-testid="order-customer">
              <p className="font-medium">{order.customerName}</p>
              <p className="ltr-value" data-testid="order-phone">
                {order.contactVisible ? (
                  <a href={`tel:${order.customerPhone}`} className="hover:underline">
                    {order.customerPhone}
                  </a>
                ) : (
                  order.customerPhone
                )}
              </p>
              {order.customerEmail ? <p className="ltr-value break-all">{order.customerEmail}</p> : null}
              {!order.contactVisible ? (
                <p className="text-xs text-muted-foreground" data-testid="contact-hidden">
                  {t("contactHidden")}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {address ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("addressHeading")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm" data-testid="order-address">
                <p className="text-muted-foreground">{localized(locale, order.countryNameAr, order.countryNameEn)}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {addressRows.map(([field, value]) => (
                    <div key={field} className="contents">
                      <dt className="text-muted-foreground">{checkout(`address.${field}`)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {address.deliveryNotes ? (
                  <p className="rounded-md bg-muted p-2">
                    <span className="text-muted-foreground">{checkout("deliveryNotes")}: </span>
                    {address.deliveryNotes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("fulfilmentHeading")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">{t("warehouse")}: </span>
                <span className="ltr-value font-mono">{order.warehouse.code}</span> ·{" "}
                {localized(locale, order.warehouse.nameAr, order.warehouse.nameEn)}
              </p>
              {order.confirmedAt ? (
                <p>
                  {t("confirmedBy")} <bdi>{order.confirmedByName ?? t("system")}</bdi> ·{" "}
                  <bdi>{format.dateTime(order.confirmedAt, "long")}</bdi>
                </p>
              ) : null}
              {order.cancelledAt ? (
                <p data-testid="cancel-info">
                  {t("cancelledBy")} <bdi>{order.cancelledByName ?? t("system")}</bdi> ·{" "}
                  <bdi>{format.dateTime(order.cancelledAt, "long")}</bdi>
                  {order.cancelReason ? (
                    <span className="block text-muted-foreground">
                      {order.cancelledByName ? order.cancelReason : t("systemReason.expired")}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {order.canConfirm ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("confirmHeading")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <p className="text-xs text-muted-foreground">{t("confirmHint")}</p>
                <ConfirmOrderForm
                  orderId={order.id}
                  version={order.version}
                  currencyCode={order.currencyCode}
                  disabled={blocked.size > 0}
                />
              </CardContent>
            </Card>
          ) : null}
          {order.canCancel ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("cancelHeading")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CancelOrderForm orderId={order.id} version={order.version} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
