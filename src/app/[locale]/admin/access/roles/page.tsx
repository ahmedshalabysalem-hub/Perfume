import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { listRolesWithPermissions } from "@/server/modules/access/access-queries.service";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/access/roles">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "roles" });
  return { title: t("title") };
}

export default async function RolesPage({ params }: PageProps<"/[locale]/admin/access/roles">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("users.view");
  if (!actor) return <NoAccess />;
  const { roles, permissions } = await listRolesWithPermissions({ actor, meta: await getRequestMeta() });
  const t = await getTranslations("roles");
  const scopes = await getTranslations("scopes");
  const modules = [...new Set(permissions.map((permission) => permission.module))];

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const granted = new Set(role.permissions.map((permission) => permission.permissionKey));
          return (
            <Card key={role.id} data-testid="role-card">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {localized(locale, role.nameAr, role.nameEn)}
                  {role.isSystem ? <Badge variant="muted">{t("system")}</Badge> : null}
                </CardTitle>
                <CardDescription>{localized(locale, role.descriptionAr, role.descriptionEn)}</CardDescription>
                <p className="text-xs text-muted-foreground">
                  {t("allowedScopes")}: {role.allowedScopeTypes.map((scope) => scopes(scope)).join(" · ")} — {t("usersCount", { count: role._count.assignments })}
                </p>
              </CardHeader>
              <CardContent>
                {granted.size === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noPermissions")}</p>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">
                      {t("permissions")} ({granted.size})
                    </summary>
                    <div className="mt-3 grid gap-3">
                      {modules.map((module) => {
                        const inModule = permissions.filter((permission) => permission.module === module && granted.has(permission.key));
                        if (inModule.length === 0) return null;
                        return (
                          <div key={module}>
                            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{module}</p>
                            <ul className="mt-1 grid gap-1">
                              {inModule.map((permission) => (
                                <li key={permission.key} className="flex items-start gap-2 text-sm">
                                  {permission.available ? (
                                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                                  ) : (
                                    <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  )}
                                  <span>
                                    {locale === "ar" ? permission.ar : permission.en}
                                    <code className="ms-1 text-[0.7rem] text-muted-foreground ltr-value">{permission.key}</code>
                                    {permission.sensitive ? <Badge variant="warning" className="ms-1">{t("sensitive")}</Badge> : null}
                                    {!permission.available ? <span className="ms-1 text-xs text-muted-foreground">({t("notYetAvailable")})</span> : null}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
