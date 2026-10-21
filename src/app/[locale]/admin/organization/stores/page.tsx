import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { initLocale, metadataLocale } from "@/i18n/params";
import { LocationsPage } from "../locations";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/organization/stores">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "organization" });
  return { title: t("storesTitle") };
}

export default async function Page({ params }: PageProps<"/[locale]/admin/organization/stores">) {
  const locale = await initLocale(params);
  return <LocationsPage kind="store" locale={locale} />;
}
