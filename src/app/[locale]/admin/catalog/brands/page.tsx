import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ListToolbar, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listBrands } from "@/server/modules/catalog/brands.service";
import { can } from "@/server/rbac/authorize";
import { BrandRowActions, NewBrandButton } from "./brand-controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/catalog/brands">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "brands" });
  return { title: t("title") };
}

export default async function BrandsPage({ params, searchParams }: PageProps<"/[locale]/admin/catalog/brands">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("products.view");
  if (!actor) return <NoAccess />;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : undefined;

  const brands = await listBrands({ actor, meta: await getRequestMeta() }, { q });
  const canManage = can(actor, "catalog.brands.manage", "global-write");
  const t = await getTranslations("brands");
  const common = await getTranslations("common");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t("title")} description={t("subtitle")} actions={canManage ? <NewBrandButton /> : null} />
      <ListToolbar pathname="/admin/catalog/brands" query={q} searchPlaceholder={common("searchPlaceholder")} />
      {brands.length === 0 ? (
        <EmptyState title={common("noResults")} hint={q ? common("noResultsHint") : undefined} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{common("name")}</TableHead>
                <TableHead>{common("slug")}</TableHead>
                <TableHead>{t("countryOfOrigin")}</TableHead>
                <TableHead>{t("products")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                {canManage ? <TableHead className="text-end">{common("actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((brand) => (
                <TableRow key={brand.id} data-testid="brand-row">
                  <TableCell>
                    <p className="font-medium">{localized(locale, brand.nameAr, brand.nameEn)}</p>
                    <p className="text-xs text-muted-foreground">{locale === "ar" ? brand.nameEn : brand.nameAr}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs ltr-value">{brand.slug}</TableCell>
                  <TableCell className="ltr-value">{brand.countryOfOriginCode ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{brand._count.products}</TableCell>
                  <TableCell>
                    <ActiveBadge active={brand.isActive} />
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <BrandRowActions
                        id={brand.id}
                        isActive={brand.isActive}
                        defaults={{
                          slug: brand.slug,
                          nameEn: brand.nameEn,
                          nameAr: brand.nameAr,
                          descriptionEn: brand.descriptionEn ?? "",
                          descriptionAr: brand.descriptionAr ?? "",
                          countryOfOriginCode: brand.countryOfOriginCode ?? "",
                          websiteUrl: brand.websiteUrl ?? "",
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
