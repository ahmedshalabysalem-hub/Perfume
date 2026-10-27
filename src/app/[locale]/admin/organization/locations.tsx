import { getTranslations } from "next-intl/server";
import { TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listLegalEntities, listStores, listWarehouses } from "@/server/modules/organization/organization.service";
import { can } from "@/server/rbac/authorize";
import { NewStoreButton, NewWarehouseButton, StoreRowActions, WarehouseRowActions } from "./organization-forms";

type LocationRow = {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  legalEntityId: string;
  legalEntity: { code: string; legalNameEn: string; legalNameAr: string };
  countryCode: string;
  timezone: string;
  addressLine1: string | null;
  city: string | null;
  isActive: boolean;
  store: {
    type: "ONLINE" | "RETAIL";
    phone: string | null;
    email: string | null;
    fulfilmentWarehouseId: string | null;
  } | null;
};

/** Shared page body for stores and warehouses. */
export async function LocationsPage({ kind, locale }: { kind: "store" | "warehouse"; locale: Locale }) {
  const actor = await getAdminPageActor("organization.view");
  if (!actor) return <NoAccess />;
  const ctx = { actor, meta: await getRequestMeta() };
  const entities = await listLegalEntities(ctx);
  const warehouses = await listWarehouses(ctx);
  const warehouseOptions = warehouses
    .filter((warehouse) => warehouse.isActive)
    .map((warehouse) => ({
      id: warehouse.id,
      code: warehouse.code,
      nameEn: warehouse.nameEn,
      nameAr: warehouse.nameAr,
      legalEntityId: warehouse.legalEntityId,
    }));
  const rows: LocationRow[] =
    kind === "store"
      ? (await listStores(ctx)).map((store) => ({
          ...store,
          store: {
            type: store.type,
            phone: store.phone,
            email: store.email,
            fulfilmentWarehouseId: store.fulfilmentWarehouseId,
          },
        }))
      : warehouses.map((warehouse) => ({ ...warehouse, store: null }));
  const entityOptions = entities
    .filter(
      (entity) =>
        entity.isActive &&
        can(actor, "organization.manage", { countryCode: entity.countryCode, legalEntityId: entity.id }),
    )
    .map((entity) => ({
      id: entity.id,
      code: entity.code,
      nameEn: entity.legalNameEn,
      nameAr: entity.legalNameAr,
      countryCode: entity.countryCode,
      timezone: entity.countryCode === "EG" ? "Africa/Cairo" : "Asia/Riyadh",
    }));
  const t = await getTranslations("organization");
  const common = await getTranslations("common");
  const title = kind === "store" ? t("storesTitle") : t("warehousesTitle");
  const subtitle = kind === "store" ? t("storesSubtitle") : t("warehousesSubtitle");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={title}
        description={subtitle}
        actions={
          entityOptions.length > 0 ? (
            kind === "store" ? (
              <NewStoreButton entities={entityOptions} warehouses={warehouseOptions} />
            ) : (
              <NewWarehouseButton entities={entityOptions} />
            )
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState title={common("emptyList")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{common("code")}</TableHead>
                <TableHead>{common("name")}</TableHead>
                <TableHead>{t("legalEntity")}</TableHead>
                {kind === "store" ? <TableHead>{t("storeType")}</TableHead> : null}
                <TableHead>{t("timezone")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                <TableHead className="text-end">{common("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const manageable = can(actor, "organization.manage", {
                  countryCode: row.countryCode,
                  legalEntityId: row.legalEntityId,
                  ...(kind === "store" ? { storeId: row.id } : { warehouseId: row.id }),
                });
                const base = {
                  code: row.code,
                  legalEntityId: row.legalEntityId,
                  nameEn: row.nameEn,
                  nameAr: row.nameAr,
                  timezone: row.timezone,
                  addressLine1: row.addressLine1 ?? "",
                  city: row.city ?? "",
                };
                const entityList = entityOptions.some((entity) => entity.id === row.legalEntityId)
                  ? entityOptions
                  : [
                      ...entityOptions,
                      {
                        id: row.legalEntityId,
                        code: row.legalEntity.code,
                        nameEn: row.legalEntity.legalNameEn,
                        nameAr: row.legalEntity.legalNameAr,
                        countryCode: row.countryCode,
                        timezone: row.timezone,
                      },
                    ];
                return (
                  <TableRow key={row.id}>
                    <TableCell className="ltr-value font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="font-medium">{localized(locale, row.nameAr, row.nameEn)}</TableCell>
                    <TableCell className="text-sm">
                      {row.legalEntity.code} · <span className="ltr-value">{row.countryCode}</span>
                    </TableCell>
                    {row.store ? <TableCell>{t(`storeTypes.${row.store.type}`)}</TableCell> : null}
                    <TableCell className="ltr-value text-sm">{row.timezone}</TableCell>
                    <TableCell>
                      <ActiveBadge active={row.isActive} />
                    </TableCell>
                    <TableCell>
                      {manageable ? (
                        row.store ? (
                          <StoreRowActions
                            id={row.id}
                            isActive={row.isActive}
                            entities={entityList}
                            warehouses={warehouseOptions}
                            defaults={{
                              ...base,
                              type: row.store.type,
                              phone: row.store.phone ?? "",
                              email: row.store.email ?? "",
                              fulfilmentWarehouseId: row.store.fulfilmentWarehouseId ?? "",
                            }}
                          />
                        ) : (
                          <WarehouseRowActions
                            id={row.id}
                            isActive={row.isActive}
                            entities={entityList}
                            defaults={base}
                          />
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
