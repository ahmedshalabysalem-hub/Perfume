import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { initLocale, metadataLocale } from "@/i18n/params";
import { LocationsPage } from "../locations";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/organization/warehouses">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "organization" });
  return { title: t("warehousesTitle") };
}

export default async function Page({ params }: PageProps<"/[locale]/admin/organization/warehouses">) {
  const locale = await initLocale(params);
  return <LocationsPage kind="warehouse" locale={locale} />;
}
