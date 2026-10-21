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
import { listCountries, listLegalEntities } from "@/server/modules/organization/organization.service";
import { can } from "@/server/rbac/authorize";
import { LegalEntityRowActions, NewLegalEntityButton } from "../organization-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/organization/legal-entities">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "organization" });
  return { title: t("legalEntitiesTitle") };
}

export default async function LegalEntitiesPage({ params }: PageProps<"/[locale]/admin/organization/legal-entities">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("organization.view");
  if (!actor) return <NoAccess />;
  const ctx = { actor, meta: await getRequestMeta() };
  const [entities, countries] = await Promise.all([listLegalEntities(ctx), listCountries(ctx)]);
  // Countries in which the user may create entities.
  const manageable = countries
    .filter((country) => can(actor, "organization.manage", { countryCode: country.code }))
    .map((country) => ({ code: country.code, nameEn: country.nameEn, nameAr: country.nameAr }));
  const t = await getTranslations("organization");
  const common = await getTranslations("common");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("legalEntitiesTitle")}
        description={t("legalEntitiesSubtitle")}
        actions={manageable.length > 0 ? <NewLegalEntityButton countries={manageable} /> : null}
      />
      {entities.length === 0 ? (
        <EmptyState title={common("emptyList")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{common("code")}</TableHead>
                <TableHead>{t("legalNameEn")}</TableHead>
                <TableHead>{common("country")}</TableHead>
                <TableHead>{t("taxRegistrationNo")}</TableHead>
                <TableHead>{t("storesTitle")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                <TableHead className="text-end">{common("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell className="font-mono text-xs ltr-value">{entity.code}</TableCell>
                  <TableCell>
                    <p className="font-medium">{localized(locale, entity.legalNameAr, entity.legalNameEn)}</p>
                    <p className="text-xs text-muted-foreground">{localized(locale, entity.tradeNameAr, entity.tradeNameEn)}</p>
                  </TableCell>
                  <TableCell>{localized(locale, entity.country.nameAr, entity.country.nameEn)}</TableCell>
                  <TableCell className="font-mono text-xs ltr-value">{entity.taxRegistrationNo ?? common("notSet")}</TableCell>
                  <TableCell className="tabular-nums">
                    {entity._count.stores} / {entity._count.warehouses}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={entity.isActive} />
                  </TableCell>
                  <TableCell>
                    {can(actor, "organization.manage", { countryCode: entity.countryCode, legalEntityId: entity.id }) ? (
                      <LegalEntityRowActions
                        id={entity.id}
                        isActive={entity.isActive}
                        countries={manageable.length > 0 ? manageable : [{ code: entity.countryCode, nameEn: entity.country.nameEn, nameAr: entity.country.nameAr }]}
                        defaults={{
                          code: entity.code,
                          countryCode: entity.countryCode,
                          legalNameEn: entity.legalNameEn,
                          legalNameAr: entity.legalNameAr,
                          tradeNameEn: entity.tradeNameEn ?? "",
                          tradeNameAr: entity.tradeNameAr ?? "",
                          commercialRegistrationNo: entity.commercialRegistrationNo ?? "",
                          taxRegistrationNo: entity.taxRegistrationNo ?? "",
                          addressLine1: entity.addressLine1 ?? "",
                          addressLine2: entity.addressLine2 ?? "",
                          city: entity.city ?? "",
                          district: entity.district ?? "",
                          postalCode: entity.postalCode ?? "",
                          buildingNumber: entity.buildingNumber ?? "",
                          email: entity.email ?? "",
                          phone: entity.phone ?? "",
                        }}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
