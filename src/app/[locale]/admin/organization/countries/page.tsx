import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TableCard } from "@/components/admin/list-controls";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listCountries } from "@/server/modules/organization/organization.service";
import { can } from "@/server/rbac/authorize";
import { EditCountryButton } from "../organization-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/organization/countries">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "organization" });
  return { title: t("countriesTitle") };
}

export default async function CountriesPage({ params }: PageProps<"/[locale]/admin/organization/countries">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("organization.view");
  if (!actor) return <NoAccess />;
  const countries = await listCountries({ actor, meta: await getRequestMeta() });
  const canManage = can(actor, "organization.manage", "global");
  const t = await getTranslations("organization");
  const common = await getTranslations("common");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("countriesTitle")} description={t("countriesSubtitle")} />
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{common("country")}</TableHead>
              <TableHead>{t("currency")}</TableHead>
              <TableHead>{t("timezone")}</TableHead>
              <TableHead>{t("pricesIncludeTax")}</TableHead>
              <TableHead>{t("marketActive")}</TableHead>
              {canManage ? <TableHead className="text-end">{common("actions")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((country) => (
              <TableRow key={country.code}>
                <TableCell>
                  <p className="font-medium">{localized(locale, country.nameAr, country.nameEn)}</p>
                  <p className="text-xs text-muted-foreground ltr-value">
                    {country.code} · {country.phoneCode}
                  </p>
                </TableCell>
                <TableCell>
                  <span className="ltr-value">{country.currencyCode}</span> · {locale === "ar" ? country.currency.symbolAr : country.currency.symbolEn}
                </TableCell>
                <TableCell className="ltr-value">{country.timezone}</TableCell>
                <TableCell>{country.pricesIncludeTax ? common("yes") : common("no")}</TableCell>
                <TableCell>
                  <ActiveBadge active={country.isActive} />
                </TableCell>
                {canManage ? (
                  <TableCell className="text-end">
                    <EditCountryButton
                      code={country.code}
                      currencyCode={country.currencyCode}
                      defaults={{
                        nameEn: country.nameEn,
                        nameAr: country.nameAr,
                        timezone: country.timezone,
                        defaultLocale: country.defaultLocale === "en" ? "en" : "ar",
                        pricesIncludeTax: country.pricesIncludeTax,
                        isActive: country.isActive,
                      }}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
