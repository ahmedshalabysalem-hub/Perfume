import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listCategoryTree } from "@/server/modules/catalog/categories.service";
import { can } from "@/server/rbac/authorize";
import { CategoryRowActions, NewCategoryButton } from "./category-controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/catalog/categories">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "categories" });
  return { title: t("title") };
}

export default async function CategoriesPage({ params }: PageProps<"/[locale]/admin/catalog/categories">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("products.view");
  if (!actor) return <NoAccess />;

  const tree = await listCategoryTree({ actor, meta: await getRequestMeta() });
  const canManage = can(actor, "catalog.categories.manage", "global-write");
  const t = await getTranslations("categories");
  const common = await getTranslations("common");
  const options = tree.map(({ id, parentId, nameEn, nameAr, depth, isActive }) => ({ id, parentId, nameEn, nameAr, depth, isActive }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} description={t("subtitle")} actions={canManage ? <NewCategoryButton categories={options} /> : null} />
      {tree.length === 0 ? (
        <EmptyState title={common("emptyList")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{common("name")}</TableHead>
                <TableHead>{common("slug")}</TableHead>
                <TableHead>{t("products")}</TableHead>
                <TableHead>{common("sortOrder")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                {canManage ? <TableHead className="text-end">{common("actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tree.map((category) => (
                <TableRow key={category.id} data-testid="category-row">
                  <TableCell>
                    <div className="flex items-center gap-2" style={{ paddingInlineStart: `${category.depth * 1.25}rem` }}>
                      {category.depth > 0 ? <span className="text-muted-foreground" aria-hidden="true">↳</span> : null}
                      <span className="font-medium">{localized(locale, category.nameAr, category.nameEn)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs ltr-value">{category.slug}</TableCell>
                  <TableCell className="tabular-nums">{category.productCount}</TableCell>
                  <TableCell className="tabular-nums">{category.sortOrder}</TableCell>
                  <TableCell>
                    <ActiveBadge active={category.isActive} />
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <CategoryRowActions
                        id={category.id}
                        isActive={category.isActive}
                        categories={options}
                        defaults={{
                          slug: category.slug,
                          parentId: category.parentId ?? "",
                          nameEn: category.nameEn,
                          nameAr: category.nameAr,
                          descriptionEn: category.descriptionEn ?? "",
                          descriptionAr: category.descriptionAr ?? "",
                          sortOrder: String(category.sortOrder),
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
