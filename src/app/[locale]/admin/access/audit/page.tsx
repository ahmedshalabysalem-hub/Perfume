import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Pagination, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initLocale, metadataLocale } from "@/i18n/params";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listAuditLogs } from "@/server/modules/access/access-queries.service";
import { can } from "@/server/rbac/authorize";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/access/audit">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "audit" });
  return { title: t("title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/admin/access/audit">) {
  await initLocale(params);
  const actor = await getAdminPageActor("audit.view");
  if (!actor || !can(actor, "audit.view", "global")) return <NoAccess />;
  const raw = await searchParams;
  const result = await listAuditLogs(
    { actor, meta: await getRequestMeta() },
    { action: first(raw.action), entity: first(raw.entity), from: first(raw.from), to: first(raw.to), page: first(raw.page) },
  );
  const t = await getTranslations("audit");
  const common = await getTranslations("common");
  const format = await getFormatter();
  const { query } = result;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("actionFilter")}
          <Input name="action" defaultValue={query.action} dir="ltr" placeholder="catalog.product" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("entityFilter")}
          <NativeSelect name="entity" defaultValue={query.entity ?? ""} className="text-foreground">
            <option value="">{common("all")}</option>
            {result.entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("from")}
          <Input type="date" name="from" defaultValue={query.from} dir="ltr" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("to")}
          <Input type="date" name="to" defaultValue={query.to} dir="ltr" />
        </label>
        <button type="submit" className={buttonVariants()}>
          {common("apply")}
        </button>
      </form>

      {result.entries.length === 0 ? (
        <EmptyState title={common("noResults")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("time")}</TableHead>
                <TableHead>{t("actor")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead>{t("summary")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.entries.map((entry) => (
                <TableRow key={entry.id} className="align-top" data-testid="audit-row">
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{format.dateTime(entry.occurredAt, "long")}</TableCell>
                  <TableCell className="text-sm">
                    {entry.actor ? (
                      <>
                        <span className="block">{entry.actor.name}</span>
                        <span className="block text-xs text-muted-foreground ltr-value">{entry.actor.email}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("system")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs ltr-value">{entry.action}</code>
                    <span className="mt-1 block text-xs text-muted-foreground ltr-value">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}…` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xl text-sm">
                    <p>{entry.summary ?? "—"}</p>
                    {entry.reason ? <p className="mt-1 text-muted-foreground">{t("reason")}: “{entry.reason}”</p> : null}
                    {entry.before || entry.after ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-gold">{t("showChanges")}</summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold">{t("before")}</p>
                            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs ltr-value">{JSON.stringify(entry.before, null, 2) ?? "—"}</pre>
                          </div>
                          <div>
                            <p className="text-xs font-semibold">{t("after")}</p>
                            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs ltr-value">{JSON.stringify(entry.after, null, 2) ?? "—"}</pre>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground ltr-value">
                          {t("correlation")}: {entry.correlationId ?? "—"} · {t("ip")}: {entry.ipAddress ?? "—"}
                        </p>
                      </details>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Pagination
        pathname="/admin/access/audit"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={{ action: query.action, entity: query.entity, from: query.from, to: query.to }}
      />
    </div>
  );
}
