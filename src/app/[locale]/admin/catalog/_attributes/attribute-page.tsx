import { getTranslations } from "next-intl/server";
import { TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listAttributes, type AttributeKind } from "@/server/modules/catalog/attributes.service";
import { can } from "@/server/rbac/authorize";
import { AttributeRowActions, NewAttributeButton } from "./attribute-controls";

const TITLES = {
  note: ["notesTitle", "notesSubtitle"],
  family: ["familiesTitle", "familiesSubtitle"],
  concentration: ["concentrationsTitle", "concentrationsSubtitle"],
} as const;

export async function AttributePage({ kind, locale }: { kind: AttributeKind; locale: Locale }) {
  const actor = await getAdminPageActor("products.view");
  if (!actor) return <NoAccess />;
  const rows = await listAttributes({ actor, meta: await getRequestMeta() }, kind);
  const canManage = can(actor, "catalog.attributes.manage", "global");
  const t = await getTranslations("attributes");
  const common = await getTranslations("common");
  const [title, subtitle] = TITLES[kind];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t(title)} description={t(subtitle)} actions={canManage ? <NewAttributeButton kind={kind} /> : null} />
      {rows.length === 0 ? (
        <EmptyState title={common("emptyList")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{common("name")}</TableHead>
                <TableHead>{kind === "note" ? common("slug") : common("code")}</TableHead>
                {kind === "note" ? null : <TableHead>{common("sortOrder")}</TableHead>}
                <TableHead>{t("usage")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                {canManage ? <TableHead className="text-end">{common("actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid={`${kind}-row`}>
                  <TableCell>
                    <p className="font-medium">{localized(locale, row.nameAr, row.nameEn)}</p>
                    <p className="text-xs text-muted-foreground">{locale === "ar" ? row.nameEn : row.nameAr}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs ltr-value">{row.key}</TableCell>
                  {kind === "note" ? null : <TableCell className="tabular-nums">{row.sortOrder}</TableCell>}
                  <TableCell className="tabular-nums">{row.usage}</TableCell>
                  <TableCell>
                    <ActiveBadge active={row.isActive} />
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <AttributeRowActions
                        kind={kind}
                        id={row.id}
                        isActive={row.isActive}
                        defaults={{ key: row.key, nameEn: row.nameEn, nameAr: row.nameAr, sortOrder: String(row.sortOrder) }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
