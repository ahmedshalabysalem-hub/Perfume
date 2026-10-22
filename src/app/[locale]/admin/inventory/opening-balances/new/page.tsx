import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Card, CardContent } from "@/components/ui/primitives";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { db } from "@/server/db";
import { canPostOpeningBalances, listStockWarehouses } from "@/server/modules/inventory/stock.service";
import { OpeningBalanceForm } from "./opening-balance-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/inventory/opening-balances/new">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "inventory" });
  return { title: t("openingTitle") };
}

export default async function NewOpeningBalancePage({
  params,
}: PageProps<"/[locale]/admin/inventory/opening-balances/new">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("inventory.view");
  if (!actor) return <NoAccess />;
  const ctx = { actor, meta: await getRequestMeta() };
  if (!canPostOpeningBalances(ctx)) return <NoAccess />;

  const warehouses = (await listStockWarehouses(ctx, "inventory.adjust.approve")).filter((w) => w.isActive);
  const countries = await db.country.findMany({ select: { code: true, currencyCode: true } });
  const currencyByCountry = new Map(countries.map((country) => [country.code, country.currencyCode]));
  const t = await getTranslations("inventory");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("openingTitle")} description={t("openingSubtitle")} />
      {warehouses.length === 0 ? (
        <EmptyState title={t("noWarehouses")} />
      ) : (
        <Card>
          <CardContent>
            <OpeningBalanceForm
              warehouses={warehouses.map((warehouse) => ({
                id: warehouse.id,
                label: `${warehouse.code} · ${localized(locale, warehouse.nameAr, warehouse.nameEn)}`,
                currencyCode: currencyByCountry.get(warehouse.countryCode) ?? "",
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
