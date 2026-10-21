import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Card, CardContent } from "@/components/ui/primitives";
import { initLocale, metadataLocale } from "@/i18n/params";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { productEditorOptions } from "@/server/modules/catalog/form-options";
import { can } from "@/server/rbac/authorize";
import { EMPTY_PRODUCT, ProductForm } from "../product-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/catalog/products/new">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "products" });
  return { title: t("createTitle") };
}

export default async function NewProductPage({ params }: PageProps<"/[locale]/admin/catalog/products/new">) {
  await initLocale(params);
  const actor = await getAdminPageActor("products.view");
  if (!actor || !can(actor, "products.create", "global-write")) return <NoAccess />;
  const options = await productEditorOptions({ actor, meta: await getRequestMeta() });
  const t = await getTranslations("products");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("createTitle")} description={t("createSubtitle")} />
      <Card>
        <CardContent>
          <ProductForm defaults={EMPTY_PRODUCT} options={options} />
        </CardContent>
      </Card>
    </div>
  );
}
