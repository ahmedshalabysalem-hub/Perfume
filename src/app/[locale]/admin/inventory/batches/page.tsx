import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ListToolbar, Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { BATCH_INSPECTION_STATUSES } from "@/lib/inventory/batches";
import { BATCH_EXPIRY_FILTERS } from "@/lib/schemas/inventory";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listBatches } from "@/server/modules/inventory/batches.service";
import { listStockWarehouses } from "@/server/modules/inventory/stock.service";
import { StockStatusBadge } from "../stock-status-badge";
import { EligibilityBadge, ExpiryText, InspectionBadge, LotLabel } from "./batch-badges";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/inventory/batches">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "batches" });
  return { title: t("title") };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BatchesPage({ params, searchParams }: PageProps<"/[locale]/admin/inventory/batches">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("inventory.view");
  if (!actor) return <NoAccess />;
  const raw = await searchParams;
  const ctx = { actor, meta: await getRequestMeta() };
  const [result, warehouses] = await Promise.all([
    listBatches(ctx, {
      q: firstValue(raw.q),
      warehouse: firstValue(raw.warehouse),
      status: firstValue(raw.status),
      expiry: firstValue(raw.expiry),
      days: firstValue(raw.days),
      incomplete: firstValue(raw.incomplete),
      page: firstValue(raw.page),
    }),
    listStockWarehouses(ctx),
  ]);

  const t = await getTranslations("batches");
  const common = await getTranslations("common");
  const { query } = result;
  const filtered = !!(query.q || query.warehouse || query.status || query.expiry || query.incomplete);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ListToolbar
        pathname="/admin/inventory/batches"
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
            options: BATCH_INSPECTION_STATUSES.map((s) => ({ value: s, label: t(`inspection.${s}`) })),
          },
          {
            name: "expiry",
            label: t("filters.expiry"),
            value: query.expiry,
            options: BATCH_EXPIRY_FILTERS.map((f) => ({
              value: f,
              label: f === "expiring" ? t("filters.expiring", { days: query.days }) : t(`filters.${f}`),
            })),
          },
          {
            name: "incomplete",
            label: t("filters.details"),
            value: query.incomplete ? "1" : undefined,
            options: [{ value: "1", label: t("filters.incomplete") }],
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
                <TableHead>{t("columns.variant")}</TableHead>
                <TableHead>{t("columns.lot")}</TableHead>
                <TableHead>{t("columns.expiry")}</TableHead>
                <TableHead>{t("columns.inspection")}</TableHead>
                <TableHead>{t("columns.sale")}</TableHead>
                <TableHead>{t("columns.stock")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-testid="batch-row"
                  data-sku={row.variant.sku}
                  data-lot={row.lotNumber ?? ""}
                >
                  <TableCell>
                    <Link href={`/admin/inventory/batches/${row.id}`} className="group block min-w-0">
                      <span className="block font-medium group-hover:underline">
                        {localized(locale, row.product.nameAr, row.product.nameEn)}
                      </span>
                      <span className="ltr-value block font-mono text-xs text-muted-foreground">{row.variant.sku}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <LotLabel lotNumber={row.lotNumber} isLegacy={row.isLegacy} />
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <ExpiryText expiresOn={row.expiresOn} precision={row.expiryPrecision} state={row.expiryState} />
                  </TableCell>
                  <TableCell>
                    <InspectionBadge status={row.inspectionStatus} />
                  </TableCell>
                  <TableCell>
                    <EligibilityBadge eligibility={row.eligibility} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex flex-wrap gap-1">
                      {Object.entries(row.quantities).map(([status, quantity]) => (
                        <span key={status} className="inline-flex items-center gap-1">
                          <StockStatusBadge status={status} />
                          <span className="tabular-nums">{quantity}</span>
                        </span>
                      ))}
                    </span>
                    <span className="ltr-value block font-mono text-xs text-muted-foreground">
                      {row.warehouses.join(", ")}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname="/admin/inventory/batches"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={{
          q: query.q,
          warehouse: query.warehouse,
          status: query.status,
          expiry: query.expiry,
          incomplete: query.incomplete ? "1" : undefined,
        }}
      />
    </div>
  );
}
