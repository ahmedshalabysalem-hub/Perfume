import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { StatusBadge } from "@/components/admin/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menus";
import { Alert, Card, CardContent } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { productEditorOptions } from "@/server/modules/catalog/form-options";
import { getProductHistory } from "@/server/modules/catalog/history.service";
import { allowedProductTransitions, productTransitionPermission } from "@/server/modules/catalog/lifecycle";
import { getProductForAdmin } from "@/server/modules/catalog/products.service";
import { can } from "@/server/rbac/authorize";
import { publicFileUrl } from "@/server/storage/storage";
import { isUuid } from "@/server/validation";
import { ProductForm } from "../product-form";
import { CompliancePanel } from "./compliance-panel";
import { ContentForm } from "./content-form";
import { ImagesPanel } from "./images-panel";
import { NotesForm } from "./notes-form";
import { ProductStatusActions } from "./status-actions";
import type { ComplianceDto, MarketDto, VariantDto } from "./types";
import { VariantsPanel } from "./variants-panel";

const TABS = ["general", "fragrance", "variants", "content", "images", "compliance", "history"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/catalog/products/[id]">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const { id } = await params;
  const t = await getTranslations({ locale, namespace: "products" });
  if (!isUuid(id)) return { title: t("title") };
  const { db } = await import("@/server/db");
  const product = await db.product.findUnique({ where: { id }, select: { nameEn: true, nameAr: true } });
  return { title: product ? localized(locale, product.nameAr, product.nameEn) : t("title") };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[locale]/admin/catalog/products/[id]">) {
  const locale = await initLocale(params);
  const { id } = await params;
  const actor = await getAdminPageActor("products.view");
  if (!actor) return <NoAccess />;
  if (!isUuid(id)) notFound();

  const ctx = { actor, meta: await getRequestMeta() };
  const product = await getProductForAdmin(ctx, id).catch(() => null);
  if (!product) notFound();
  const options = await productEditorOptions(ctx);
  const history = await getProductHistory(ctx, product.id, product.variants.map((variant) => variant.id));

  const t = await getTranslations("products");
  const historyT = await getTranslations("history");
  const format = await getFormatter();
  const query = await searchParams;
  const requestedTab = typeof query.tab === "string" ? query.tab : "general";
  const defaultTab = (TABS as readonly string[]).includes(requestedTab) ? requestedTab : "general";

  const canEdit = can(actor, "products.update", "global-write");
  const transitions = allowedProductTransitions(product.status).filter((target) =>
    can(actor, productTransitionPermission(product.status, target), "global-write"),
  );
  const markets: MarketDto[] = options.countries.map((country) => ({
    ...country,
    editable: can(actor, "products.prices.update", { countryCode: country.code }),
  }));
  const canEditPrices = markets.some((market) => market.editable);

  const variants: VariantDto[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    barcodeType: variant.barcodeType,
    barcodeSource: variant.barcodeSource,
    nameEn: variant.nameEn,
    nameAr: variant.nameAr,
    sizeMl: variant.sizeMl ? variant.sizeMl.toFixed(2) : null,
    weightGrams: variant.weightGrams,
    isTester: variant.isTester,
    status: variant.status,
    trackInventory: variant.trackInventory,
    trackBatches: variant.trackBatches,
    trackExpiry: variant.trackExpiry,
    sortOrder: variant.sortOrder,
    prices: variant.prices.map((price) => ({
      countryCode: price.countryCode,
      currencyCode: price.currencyCode,
      amount: price.amount.toFixed(2),
      compareAtAmount: price.compareAtAmount ? price.compareAtAmount.toFixed(2) : null,
      isActive: price.isActive,
    })),
  }));
  const compliance: ComplianceDto[] = product.compliance.map((entry) => ({
    id: entry.id,
    countryCode: entry.countryCode,
    authority: entry.authority,
    referenceType: entry.referenceType,
    referenceNumber: entry.referenceNumber,
    status: entry.status,
    issuedAt: entry.issuedAt ? entry.issuedAt.toISOString().slice(0, 10) : null,
    expiresAt: entry.expiresAt ? entry.expiresAt.toISOString().slice(0, 10) : null,
    notes: entry.notes,
    editable: can(actor, "products.compliance.manage", { countryCode: entry.countryCode }),
  }));
  const complianceMarkets = markets.filter((market) => can(actor, "products.compliance.manage", { countryCode: market.code }));
  const notesByLayer = (layer: "TOP" | "HEART" | "BASE") =>
    product.notes.filter((note) => note.layer === layer).map((note) => note.noteId);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {localized(locale, product.nameAr, product.nameEn)}
            <StatusBadge status={product.status} />
          </span>
        }
        description={`${localized(locale, product.brand.nameAr, product.brand.nameEn)} · ${product.slug}`}
        actions={
          <>
            {product.status === "PUBLISHED" ? (
              <Link href={`/products/${product.slug}`} className={buttonVariants({ variant: "ghost" })} target="_blank">
                <ExternalLink /> {t("viewInStore")}
              </Link>
            ) : null}
            <ProductStatusActions productId={product.id} status={product.status} transitions={[...transitions]} />
          </>
        }
      />
      {product.status === "DRAFT" ? <Alert variant="info" className="mb-4">{t("notPublishedHint")}</Alert> : null}
      {!canEdit ? <Alert className="mb-4">{t("readOnlyHint")}</Alert> : null}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} data-testid={`tab-${tab}`}>
              {t(`sections.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardContent>
              <ProductForm
                productId={product.id}
                readOnly={!canEdit}
                options={options}
                defaults={{
                  brandId: product.brandId,
                  type: product.type,
                  slug: product.slug,
                  nameEn: product.nameEn,
                  nameAr: product.nameAr,
                  shortDescriptionEn: product.shortDescriptionEn ?? "",
                  shortDescriptionAr: product.shortDescriptionAr ?? "",
                  descriptionEn: product.descriptionEn ?? "",
                  descriptionAr: product.descriptionAr ?? "",
                  audience: product.audience ?? "",
                  concentrationId: product.concentrationId ?? "",
                  fragranceFamilyId: product.fragranceFamilyId ?? "",
                  categoryIds: product.categories.map((category) => category.categoryId),
                  primaryCategoryId: product.primaryCategoryId ?? "",
                  launchYear: product.launchYear?.toString() ?? "",
                  countryOfOriginCode: product.countryOfOriginCode ?? "",
                  manufacturerName: product.manufacturerName ?? "",
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fragrance">
          <Card>
            <CardContent>
              <NotesForm
                productId={product.id}
                notes={options.notes}
                readOnly={!canEdit}
                initial={{ top: notesByLayer("TOP"), heart: notesByLayer("HEART"), base: notesByLayer("BASE") }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variants">
          <VariantsPanel productId={product.id} variants={variants} markets={markets} canEdit={canEdit} canEditPrices={canEditPrices} />
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <CardContent>
              <ContentForm
                productId={product.id}
                readOnly={!canEdit}
                defaults={{
                  ingredientsEn: product.ingredientsEn ?? "",
                  ingredientsAr: product.ingredientsAr ?? "",
                  warningsEn: product.warningsEn ?? "",
                  warningsAr: product.warningsAr ?? "",
                  storageInstructionsEn: product.storageInstructionsEn ?? "",
                  storageInstructionsAr: product.storageInstructionsAr ?? "",
                  seoTitleEn: product.seoTitleEn ?? "",
                  seoTitleAr: product.seoTitleAr ?? "",
                  seoDescriptionEn: product.seoDescriptionEn ?? "",
                  seoDescriptionAr: product.seoDescriptionAr ?? "",
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images">
          <ImagesPanel
            productId={product.id}
            canEdit={canEdit}
            images={product.images.map((image) => ({
              id: image.id,
              url: publicFileUrl(image.storageKey),
              altEn: image.altEn,
              altAr: image.altAr,
              width: image.width,
              height: image.height,
            }))}
          />
        </TabsContent>

        <TabsContent value="compliance">
          <CompliancePanel productId={product.id} entries={compliance} markets={complianceMarkets} canAdd={complianceMarkets.length > 0} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{historyT("empty")}</p>
              ) : (
                <ol className="grid gap-3" data-testid="history-list">
                  {history.map((entry) => (
                    <li key={entry.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs ltr-value">{entry.action}</code>
                        <span className="text-xs text-muted-foreground">
                          {format.dateTime(entry.occurredAt, "long")} ·{" "}
                          {entry.actorName ? historyT("by", { name: entry.actorName }) : historyT("system")}
                        </span>
                      </div>
                      {entry.summary ? <p className="mt-1">{entry.summary}</p> : null}
                      {entry.reason ? <p className="mt-1 text-muted-foreground">“{entry.reason}”</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
