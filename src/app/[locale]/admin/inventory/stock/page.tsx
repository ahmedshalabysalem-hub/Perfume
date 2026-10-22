import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ListToolbar, Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { STOCK_STATUSES } from "@/lib/schemas/inventory";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { canPostOpeningBalances, listStock, listStockWarehouses } from "@/server/modules/inventory/stock.service";
import { LotLabel } from "../batches/batch-badges";
import { StockStatusBadge, VariantName } from "../stock-status-badge";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/inventory/stock">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "inventory" });
  return { title: t("title") };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StockPage({ params, searchParams }: PageProps<"/[locale]/admin/inventory/stock">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("inventory.view");
  if (!actor) return <NoAccess />;
  const raw = await searchParams;
  const ctx = { actor, meta: await getRequestMeta() };
  const [result, warehouses] = await Promise.all([
    listStock(ctx, {
      q: firstValue(raw.q),
      warehouse: firstValue(raw.warehouse),
      status: firstValue(raw.status),
      page: firstValue(raw.page),
    }),
    listStockWarehouses(ctx),
  ]);

  const t = await getTranslations("inventory");
  const common = await getTranslations("common");
  const statusLabels = await getTranslations("stockStatus");
  const { query } = result;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canPostOpeningBalances(ctx) ? (
            <Link
              href="/admin/inventory/opening-balances/new"
              className={buttonVariants()}
              data-testid="new-opening-balance"
            >
              <Plus /> {t("openingBalance")}
            </Link>
          ) : null
        }
      />
      <ListToolbar
        pathname="/admin/inventory/stock"
        query={query.q}
        searchPlaceholder={t("searchPlaceholder")}
        autoFocusSearch
        filters={[
          {
            name: "warehouse",
            label: t("filters.warehouse"),
            value: query.warehouse,
            options: warehouses.map((w) => ({
              value: w.id,
              label: `${w.code} · ${localized(locale, w.nameAr, w.nameEn)}`,
            })),
          },
          {
            name: "status",
            label: t("filters.status"),
            value: query.status,
            options: STOCK_STATUSES.map((s) => ({ value: s, label: statusLabels(s) })),
          },
        ]}
      />

      {result.rows.length === 0 ? (
        query.q || query.warehouse || query.status ? (
          <EmptyState title={common("noResults")} hint={common("noResultsHint")} />
        ) : (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        )
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.variant")}</TableHead>
                <TableHead>{t("columns.warehouse")}</TableHead>
                <TableHead>{t("columns.lot")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="text-end">{t("columns.onHand")}</TableHead>
                <TableHead className="text-end">{t("columns.reserved")}</TableHead>
                <TableHead className="text-end">{t("columns.available")}</TableHead>
                <TableHead className="text-end">{t("columns.availableForSale")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.id} data-testid="stock-row" data-sku={row.variant.sku}>
                  <TableCell>
                    <Link href={`/admin/inventory/stock/${row.variant.id}`} className="group block min-w-0">
                      <span className="block font-medium group-hover:underline">
                        {localized(locale, row.product.nameAr, row.product.nameEn)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        <span className="ltr-value font-mono">{row.variant.sku}</span>
                        {" · "}
                        <VariantName locale={locale} variant={row.variant} />
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="ltr-value font-mono text-xs">{row.warehouse.code}</span>{" "}
                    <span className="text-muted-foreground">
                      {localized(locale, row.warehouse.nameAr, row.warehouse.nameEn)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.batch ? (
                      <Link href={`/admin/inventory/batches/${row.batch.id}`} className="hover:underline">
                        <LotLabel lotNumber={row.batch.lotNumber} isLegacy={row.batch.isLegacy} />
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StockStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums" data-testid="stock-on-hand">
                    {row.onHand}
                  </TableCell>
                  <TableCell className="text-end text-muted-foreground tabular-nums">{row.reserved}</TableCell>
                  <TableCell className="text-end tabular-nums">{row.available}</TableCell>
                  <TableCell className="text-end font-medium tabular-nums" data-testid="stock-available-for-sale">
                    {row.availableForSale}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname="/admin/inventory/stock"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={{ q: query.q, warehouse: query.warehouse, status: query.status }}
      />
    </div>
  );
}
