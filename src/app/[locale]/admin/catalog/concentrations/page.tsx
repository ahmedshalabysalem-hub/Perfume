import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { initLocale, metadataLocale } from "@/i18n/params";
import { AttributePage } from "../_attributes/attribute-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/catalog/concentrations">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "attributes" });
  return { title: t("concentrationsTitle") };
}

export default async function Page({ params }: PageProps<"/[locale]/admin/catalog/concentrations">) {
  const locale = await initLocale(params);
  return <AttributePage kind="concentration" locale={locale} />;
}
