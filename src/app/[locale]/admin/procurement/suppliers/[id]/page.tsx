import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menus";
import { Alert, Card, CardContent } from "@/components/ui/primitives";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { ForbiddenError } from "@/server/errors";
import { getSupplier, getSupplierHistory, listActiveCurrencies } from "@/server/modules/procurement/suppliers.service";
import { can } from "@/server/rbac/authorize";
import { isUuid } from "@/server/validation";
import { SupplierForm, SupplierStatusToggle } from "../supplier-forms";
import { ContactsPanel } from "./contacts-panel";
import { SupplierProductsPanel, type SupplierProductDto } from "./products-panel";

const TABS = ["profile", "contacts", "products", "history"] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/procurement/suppliers/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "suppliers" });
  return { title: t("title") };
}

export default async function SupplierPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/procurement/suppliers/[id]">) {
  const locale = await initLocale(params);
  const { id } = await params;
  const actor = await getAdminPageActor("suppliers.view");
  if (!actor) return <NoAccess />;
  if (!isUuid(id)) notFound();

  const ctx = { actor, meta: await getRequestMeta() };
  let supplier;
  try {
    supplier = await getSupplier(ctx, id);
  } catch (error) {
    if (error instanceof ForbiddenError) return <NoAccess />;
    notFound();
  }
  const [history, currencies] = await Promise.all([getSupplierHistory(ctx, id), listActiveCurrencies()]);

  const t = await getTranslations("suppliers");
  const historyT = await getTranslations("history");
  const format = await getFormatter();
  const query = await searchParams;
  const requestedTab = typeof query.tab === "string" ? query.tab : "profile";
  const defaultTab = (TABS as readonly string[]).includes(requestedTab) ? requestedTab : "profile";
  const canEdit = can(actor, "suppliers.manage", {
    countryCode: supplier.countryCode,
    legalEntityId: supplier.legalEntityId,
  });

  const currencyCodes = currencies.map((currency) => currency.code);
  if (!currencyCodes.includes(supplier.currencyCode)) currencyCodes.push(supplier.currencyCode);

  const products: SupplierProductDto[] = supplier.products.map((row) => ({
    id: row.id,
    productId: row.variant.product.id,
    productNameEn: row.variant.product.nameEn,
    productNameAr: row.variant.product.nameAr,
    variantLabel:
      localized(locale, row.variant.nameAr, row.variant.nameEn) ||
      (row.variant.sizeMl ? `${row.variant.sizeMl.toFixed(0)} ml` : null),
    sku: row.variant.sku,
    barcode: row.variant.barcode,
    supplierSku: row.supplierSku,
    supplierProductName: row.supplierProductName,
    lastCostAmount: row.lastCostAmount?.toFixed(2) ?? null,
    lastCostCurrency: row.lastCostCurrency,
    lastCostAt: row.lastCostAt?.toISOString() ?? null,
    isActive: row.isActive,
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {localized(locale, supplier.nameAr, supplier.nameEn)}
            <ActiveBadge active={supplier.isActive} />
          </span>
        }
        description={`${supplier.code} · ${supplier.legalEntity.code} · ${localized(
          locale,
          supplier.legalEntity.legalNameAr,
          supplier.legalEntity.legalNameEn,
        )}`}
        actions={canEdit ? <SupplierStatusToggle id={supplier.id} isActive={supplier.isActive} /> : null}
      />
      {!canEdit ? <Alert className="mb-4">{t("readOnlyHint")}</Alert> : null}
      {!supplier.isActive ? (
        <Alert variant="info" className="mb-4">
          {t("inactiveHint")}
        </Alert>
      ) : null}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} data-testid={`tab-${tab}`}>
              {t(`sections.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardContent>
              <SupplierForm
                id={supplier.id}
                readOnly={!canEdit}
                currencies={currencyCodes}
                entities={[
                  {
                    id: supplier.legalEntityId,
                    code: supplier.legalEntity.code,
                    countryCode: supplier.countryCode,
                    legalNameEn: supplier.legalEntity.legalNameEn,
                    legalNameAr: supplier.legalEntity.legalNameAr,
                    currencyCode: supplier.currencyCode,
                  },
                ]}
                defaults={{
                  code: supplier.code,
                  legalEntityId: supplier.legalEntityId,
                  nameEn: supplier.nameEn,
                  nameAr: supplier.nameAr,
                  supplierCountryCode: supplier.supplierCountryCode,
                  taxRegistrationNo: supplier.taxRegistrationNo ?? "",
                  commercialRegistrationNo: supplier.commercialRegistrationNo ?? "",
                  paymentTerms: supplier.paymentTerms,
                  paymentTermDays: supplier.paymentTermDays?.toString() ?? "",
                  currencyCode: supplier.currencyCode,
                  email: supplier.email ?? "",
                  phone: supplier.phone ?? "",
                  websiteUrl: supplier.websiteUrl ?? "",
                  addressLine1: supplier.addressLine1 ?? "",
                  city: supplier.city ?? "",
                  notes: supplier.notes ?? "",
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsPanel
            supplierId={supplier.id}
            canEdit={canEdit}
            contacts={supplier.contacts.map((contact) => ({
              id: contact.id,
              name: contact.name,
              jobTitle: contact.jobTitle,
              email: contact.email,
              phone: contact.phone,
              isPrimary: contact.isPrimary,
            }))}
          />
        </TabsContent>

        <TabsContent value="products">
          <SupplierProductsPanel
            supplierId={supplier.id}
            rows={products}
            currencyCode={supplier.currencyCode}
            canEdit={canEdit}
            canAdd={supplier.isActive}
          />
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
                        <code className="ltr-value rounded bg-muted px-1.5 py-0.5 text-xs">{entry.action}</code>
                        <span className="text-xs text-muted-foreground">
                          {format.dateTime(entry.occurredAt, "long")} ·{" "}
                          {entry.actorName ? historyT("by", { name: entry.actorName }) : historyT("system")}
                        </span>
                      </div>
                      {entry.summary ? <p className="mt-1">{entry.summary}</p> : null}
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
