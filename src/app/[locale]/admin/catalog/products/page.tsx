import { ImageIcon, Plus, ScanBarcode } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ListToolbar, Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { StatusBadge, type StatusValue } from "@/components/admin/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { PRODUCT_STATUSES, PRODUCT_TYPES } from "@/lib/schemas/catalog";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { db } from "@/server/db";
import { listProducts } from "@/server/modules/catalog/products.service";
import { can } from "@/server/rbac/authorize";
import { publicFileUrl } from "@/server/storage/storage";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/catalog/products">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "products" });
  return { title: t("title") };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ params, searchParams }: PageProps<"/[locale]/admin/catalog/products">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("products.view");
  if (!actor) return <NoAccess />;
  const raw = await searchParams;
  const rawQuery = {
    q: firstValue(raw.q),
    status: firstValue(raw.status),
    brand: firstValue(raw.brand),
    category: firstValue(raw.category),
    type: firstValue(raw.type),
    sort: firstValue(raw.sort),
    page: firstValue(raw.page),
  };

  const result = await listProducts({ actor, meta: await getRequestMeta() }, rawQuery, locale);
  const [brands, categories] = await Promise.all([
    db.brand.findMany({ orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, nameAr: true } }),
  ]);

  const t = await getTranslations("products");
  const statusLabels = await getTranslations("status");
  const typeLabels = await getTranslations("productType");
  const format = await getFormatter();
  const canCreate = can(actor, "products.create", "global-write");
  const { query } = result;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canCreate ? (
            <Link href="/admin/catalog/products/new" className={buttonVariants()} data-testid="new-product">
              <Plus /> {t("new")}
            </Link>
          ) : null
        }
      />
      <ListToolbar
        pathname="/admin/catalog/products"
        query={query.q}
        searchPlaceholder={t("searchPlaceholder")}
        autoFocusSearch
        filters={[
          { name: "status", label: t("filters.status"), value: query.status, options: PRODUCT_STATUSES.map((s) => ({ value: s, label: statusLabels(s) })) },
          { name: "brand", label: t("filters.brand"), value: query.brand, options: brands.map((b) => ({ value: b.id, label: localized(locale, b.nameAr, b.nameEn) })) },
          { name: "category", label: t("filters.category"), value: query.category, options: categories.map((c) => ({ value: c.id, label: localized(locale, c.nameAr, c.nameEn) })) },
          { name: "type", label: t("filters.type"), value: query.type, options: PRODUCT_TYPES.map((type) => ({ value: type, label: typeLabels(type) })) },
        ]}
        sort={{
          name: "sort",
          label: (await getTranslations("common"))("sortBy"),
          value: query.sort,
          options: [
            { value: "updated", label: t("sort.updated") },
            { value: "created", label: t("sort.created") },
            { value: "name", label: t("sort.name") },
          ],
        }}
      />

      {result.exactMatch ? (
        <Alert variant="info" className="mb-4 items-center justify-between" data-testid="exact-match">
          <ScanBarcode />
          <span className="flex-1">{t("exactMatch", { query: query.q ?? "", sku: result.exactMatch.sku })}</span>
          <Link href={`/admin/catalog/products/${result.exactMatch.productId}`} className={buttonVariants({ size: "sm" })}>
            {t("openVariant")}
          </Link>
        </Alert>
      ) : null}

      {result.rows.length === 0 ? (
        <EmptyState title={(await getTranslations("common"))("noResults")} hint={(await getTranslations("common"))("noResultsHint")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.product")}</TableHead>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.variants")}</TableHead>
                <TableHead>{t("columns.markets")}</TableHead>
                <TableHead>{t("columns.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.id} data-testid="product-row">
                  <TableCell>
                    <Link href={`/admin/catalog/products/${row.id}`} className="group flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {row.imageKey ? (
                          // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                          <img src={publicFileUrl(row.imageKey)} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium group-hover:underline">{localized(locale, row.nameAr, row.nameEn)}</span>
                        <span className="block text-xs text-muted-foreground">{localized(locale, row.brandNameAr, row.brandNameEn)}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{typeLabels(row.type as (typeof PRODUCT_TYPES)[number])}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status as StatusValue} />
                  </TableCell>
                  <TableCell className="tabular-nums">{row.variantCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {row.pricedMarkets.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        row.pricedMarkets.map((market) => (
                          <Badge key={market} variant="outline" className="ltr-value">
                            {market}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {format.dateTime(row.updatedAt, "short")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname="/admin/catalog/products"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={{ q: query.q, status: query.status, brand: query.brand, category: query.category, type: query.type, sort: query.sort }}
      />
    </div>
  );
}
