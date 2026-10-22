import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { formatMoney } from "@/lib/money";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { getVariantStock, listStockWarehouses } from "@/server/modules/inventory/stock.service";
import { isUuid } from "@/server/validation";
import { StockStatusBadge, VariantName } from "../../stock-status-badge";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/inventory/stock/[variantId]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "inventory" });
  return { title: t("movements") };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Unit costs carry 4 decimals; show at least the currency's 2 and drop the rest of the trailing zeros. */
function formatUnitCost(amount: string, currency: string, locale: string): string {
  const fraction = amount.split(".")[1] ?? "";
  const decimals = Math.max(2, fraction.replace(/0+$/, "").length);
  return formatMoney(amount, currency, locale, decimals);
}

export default async function VariantStockPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/inventory/stock/[variantId]">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("inventory.view");
  if (!actor) return <NoAccess />;
  const { variantId } = await params;
  if (!isUuid(variantId)) notFound();
  const raw = await searchParams;
  const ctx = { actor, meta: await getRequestMeta() };
  const [stock, warehouses] = await Promise.all([
    getVariantStock(ctx, variantId.toLowerCase(), { warehouse: firstValue(raw.warehouse), page: firstValue(raw.page) }),
    listStockWarehouses(ctx),
  ]);
  if (!stock) notFound();

  const t = await getTranslations("inventory");
  const common = await getTranslations("common");
  const typeLabels = await getTranslations("movementType");
  const format = await getFormatter();
  const { variant, query } = stock;
  const pathname = `/admin/inventory/stock/${variant.id}`;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("variantTitle", { sku: variant.sku })}
        description={
          <>
            {localized(locale, variant.product.nameAr, variant.product.nameEn)}
            {" · "}
            <VariantName locale={locale} variant={variant} />
          </>
        }
        actions={
          <Link href="/admin/inventory/stock" className={buttonVariants({ variant: "outline" })}>
            {t("title")}
          </Link>
        }
      />
      {!variant.trackInventory ? (
        <Alert variant="warning" className="mb-4">
          {t("notTracked")}
        </Alert>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("balances")}</CardTitle>
        </CardHeader>
        <CardContent>
          {stock.balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.warehouse")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="text-end">{t("columns.onHand")}</TableHead>
                  <TableHead className="text-end">{t("columns.reserved")}</TableHead>
                  <TableHead className="text-end">{t("columns.available")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.balances.map((balance) => (
                  <TableRow key={balance.id} data-testid="variant-balance-row">
                    <TableCell className="text-sm">
                      <span className="ltr-value font-mono text-xs">{balance.warehouse.code}</span>{" "}
                      <span className="text-muted-foreground">
                        {localized(locale, balance.warehouse.nameAr, balance.warehouse.nameEn)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StockStatusBadge status={balance.status} />
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{balance.onHand}</TableCell>
                    <TableCell className="text-end text-muted-foreground tabular-nums">{balance.reserved}</TableCell>
                    <TableCell className="text-end font-medium tabular-nums">{balance.available}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">{t("movements")}</h2>
      {warehouses.length > 1 ? (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {t("filters.warehouse")}
            <NativeSelect name="warehouse" defaultValue={query.warehouse ?? ""} className="min-w-56 text-foreground">
              <option value="">{t("allWarehouses")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {`${w.code} · ${localized(locale, w.nameAr, w.nameEn)}`}
                </option>
              ))}
            </NativeSelect>
          </label>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            {common("apply")}
          </button>
        </form>
      ) : null}
      {stock.movements.length === 0 ? (
        <EmptyState title={t("noMovements")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.postedAt")}</TableHead>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.warehouse")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="text-end">{t("columns.quantity")}</TableHead>
                <TableHead className="text-end">{t("columns.balanceAfter")}</TableHead>
                <TableHead className="text-end">{t("columns.unitCost")}</TableHead>
                <TableHead>{t("columns.actor")}</TableHead>
                <TableHead>{t("columns.reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.movements.map((movement) => (
                <TableRow key={movement.id} data-testid="movement-row">
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {format.dateTime(movement.postedAt, "short")}
                  </TableCell>
                  <TableCell className="text-sm">{typeLabels(movement.type)}</TableCell>
                  <TableCell className="ltr-value font-mono text-xs">{movement.warehouse.code}</TableCell>
                  <TableCell>
                    <StockStatusBadge status={movement.status} />
                  </TableCell>
                  <TableCell
                    className={`text-end font-medium tabular-nums ${movement.quantity < 0 ? "text-destructive" : "text-success"}`}
                  >
                    <span className="ltr-value">
                      {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{movement.balanceAfter}</TableCell>
                  <TableCell className="text-end text-sm whitespace-nowrap tabular-nums">
                    {movement.unitCost && movement.currencyCode
                      ? formatUnitCost(movement.unitCost, movement.currencyCode, locale)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{movement.actorName ?? t("system")}</TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">{movement.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname={pathname}
        page={stock.page}
        pageCount={stock.pageCount}
        total={stock.total}
        params={{ warehouse: query.warehouse }}
      />
    </div>
  );
}
