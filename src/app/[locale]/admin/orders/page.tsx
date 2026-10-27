import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ListToolbar, Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES } from "@/lib/schemas/orders";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listOrders } from "@/server/modules/orders/orders.service";
import { listMarkets } from "@/server/modules/storefront/storefront.service";
import { OrderStatusBadge, PaymentStatusBadge } from "./order-badges";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/orders">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "orders" });
  return { title: t("title") };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrdersPage({ params, searchParams }: PageProps<"/[locale]/admin/orders">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("orders.view");
  if (!actor) return <NoAccess />;
  const raw = await searchParams;
  const ctx = { actor, meta: await getRequestMeta() };
  const [result, markets] = await Promise.all([
    listOrders(ctx, {
      q: firstValue(raw.q),
      status: firstValue(raw.status),
      country: firstValue(raw.country),
      page: firstValue(raw.page),
    }),
    listMarkets(),
  ]);
  const t = await getTranslations("orders");
  const statuses = await getTranslations("orderStatus");
  const common = await getTranslations("common");
  const format = await getFormatter();
  const { query } = result;
  const filtered = !!(query.q || query.status || query.country);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ListToolbar
        pathname="/admin/orders"
        query={query.q}
        searchPlaceholder={t("searchPlaceholder")}
        autoFocusSearch
        filters={[
          {
            name: "status",
            label: t("filters.status"),
            value: query.status,
            options: ORDER_STATUSES.map((status) => ({ value: status, label: statuses(status) })),
          },
          {
            name: "country",
            label: t("filters.country"),
            value: query.country,
            options: markets.map((market) => ({
              value: market.code,
              label: localized(locale, market.nameAr, market.nameEn),
            })),
          },
        ]}
      />

      {result.rows.length === 0 ? (
        filtered ? (
          <EmptyState title={common("noResults")} hint={common("noResultsHint")} />
        ) : (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        )
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.order")}</TableHead>
                <TableHead>{t("columns.customer")}</TableHead>
                <TableHead>{t("columns.store")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="text-end">{t("columns.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.id} data-testid="order-row" data-order-number={row.orderNumber}>
                  <TableCell>
                    <Link href={`/admin/orders/${row.id}`} className="group block min-w-0">
                      <span className="ltr-value block font-mono font-medium group-hover:underline">
                        {row.orderNumber}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {format.dateTime(row.placedAt, "long")}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="block">{row.customerName}</span>
                    <span className="ltr-value block text-xs text-muted-foreground" data-testid="order-phone">
                      {row.customerPhone}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {localized(locale, row.store.nameAr, row.store.nameEn)}
                    <span className="block text-xs text-muted-foreground">
                      {t("itemCount", { count: row.itemCount })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      <OrderStatusBadge status={row.status} />
                      <PaymentStatusBadge status={row.paymentStatus} />
                    </span>
                  </TableCell>
                  <TableCell className="text-end text-sm whitespace-nowrap tabular-nums">
                    {formatMoney(row.total ?? row.subtotal, row.currencyCode, locale)}
                    {row.total ? null : (
                      <span className="block text-xs text-muted-foreground">{t("subtotalOnly")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname="/admin/orders"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={{ q: query.q, status: query.status, country: query.country }}
      />
    </div>
  );
}
