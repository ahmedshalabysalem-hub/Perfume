import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ListToolbar, Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import {
  listActiveCurrencies,
  listSuppliers,
  supplierEntityOptions,
} from "@/server/modules/procurement/suppliers.service";
import { NewSupplierButton } from "./supplier-forms";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/procurement/suppliers">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "suppliers" });
  return { title: t("title") };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SuppliersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/procurement/suppliers">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("suppliers.view");
  if (!actor) return <NoAccess />;
  const raw = await searchParams;
  const ctx = { actor, meta: await getRequestMeta() };
  const [result, entities, currencies] = await Promise.all([
    listSuppliers(ctx, {
      q: firstValue(raw.q),
      status: firstValue(raw.status),
      entity: firstValue(raw.entity),
      page: firstValue(raw.page),
    }),
    supplierEntityOptions(ctx),
    listActiveCurrencies(),
  ]);
  const t = await getTranslations("suppliers");
  const common = await getTranslations("common");
  const { query } = result;
  // Entities appearing in the filter: those the user can manage plus those of listed suppliers.
  const entityFilter = new Map<string, string>();
  for (const entity of entities) {
    entityFilter.set(entity.id, `${entity.code} · ${localized(locale, entity.legalNameAr, entity.legalNameEn)}`);
  }
  for (const row of result.rows) {
    entityFilter.set(
      row.legalEntityId,
      `${row.legalEntity.code} · ${localized(locale, row.legalEntity.legalNameAr, row.legalEntity.legalNameEn)}`,
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          entities.length > 0 ? (
            <NewSupplierButton entities={entities} currencies={currencies.map((currency) => currency.code)} />
          ) : null
        }
      />
      <ListToolbar
        pathname="/admin/procurement/suppliers"
        query={query.q}
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          {
            name: "status",
            label: common("status"),
            value: query.status,
            options: [
              { value: "active", label: common("active") },
              { value: "inactive", label: common("inactive") },
            ],
          },
          {
            name: "entity",
            label: t("legalEntity"),
            value: query.entity,
            options: [...entityFilter].map(([value, label]) => ({ value, label })),
          },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState
          title={query.q || query.status || query.entity ? common("noResults") : t("empty")}
          hint={query.q || query.status || query.entity ? common("noResultsHint") : t("emptyHint")}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{common("code")}</TableHead>
                <TableHead>{t("supplier")}</TableHead>
                <TableHead>{t("legalEntity")}</TableHead>
                <TableHead>{t("taxRegistrationNo")}</TableHead>
                <TableHead>{t("paymentTerms")}</TableHead>
                <TableHead>{t("primaryContact")}</TableHead>
                <TableHead>{t("productsCount")}</TableHead>
                <TableHead>{common("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => {
                const contact = row.contacts[0];
                return (
                  <TableRow key={row.id} data-testid="supplier-row" data-code={row.code}>
                    <TableCell className="ltr-value font-mono text-xs">{row.code}</TableCell>
                    <TableCell>
                      <Link href={`/admin/procurement/suppliers/${row.id}`} className="font-medium hover:underline">
                        {localized(locale, row.nameAr, row.nameEn)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        <span className="ltr-value">{row.supplierCountryCode}</span> ·{" "}
                        <span className="ltr-value">{row.currencyCode}</span>
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="ltr-value font-mono text-xs">{row.legalEntity.code}</span>
                    </TableCell>
                    <TableCell className="ltr-value font-mono text-xs">
                      {row.taxRegistrationNo ?? common("notSet")}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.paymentTerms === "NET"
                        ? t("netDays", { days: row.paymentTermDays ?? 0 })
                        : t(`terms.${row.paymentTerms}`)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {contact ? (
                        <>
                          <p>{contact.name}</p>
                          <p className="ltr-value text-xs text-muted-foreground">
                            {contact.email ?? contact.phone ?? ""}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{common("notSet")}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{row._count.products}</TableCell>
                    <TableCell>
                      <ActiveBadge active={row.isActive} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname="/admin/procurement/suppliers"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={{ q: query.q, status: query.status, entity: query.entity }}
      />
    </div>
  );
}
