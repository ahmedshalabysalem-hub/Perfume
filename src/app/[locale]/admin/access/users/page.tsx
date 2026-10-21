import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ListToolbar, TableCard } from "@/components/admin/list-controls";
import { EmptyState, NoAccess, PageHeader } from "@/components/admin/page-parts";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { getAssignmentOptions, listStaffUsers } from "@/server/modules/access/users.service";
import { can } from "@/server/rbac/authorize";
import { CreateStaffUserButton } from "../user-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/access/users">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "users" });
  return { title: t("title") };
}

export default async function UsersPage({ params, searchParams }: PageProps<"/[locale]/admin/access/users">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("users.view");
  if (!actor) return <NoAccess />;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : undefined;
  const status = typeof query.status === "string" ? query.status : undefined;
  const ctx = { actor, meta: await getRequestMeta() };
  const users = await listStaffUsers(ctx, { q, status });
  const canManage = can(actor, "users.manage", "global");
  const options = canManage ? await getAssignmentOptions(ctx) : null;
  const t = await getTranslations("users");
  const statusLabels = await getTranslations("status");
  const common = await getTranslations("common");
  const format = await getFormatter();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={options ? <CreateStaffUserButton options={options} /> : null}
      />
      <ListToolbar
        pathname="/admin/access/users"
        query={q}
        searchPlaceholder={common("searchPlaceholder")}
        filters={[
          {
            name: "status",
            label: common("status"),
            value: status,
            options: (["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const).map((value) => ({
              value,
              label: statusLabels(value),
            })),
          },
        ]}
      />
      {users.length === 0 ? (
        <EmptyState title={common("noResults")} />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("roles")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                <TableHead>{t("lastLogin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid="user-row">
                  <TableCell>
                    <Link href={`/admin/access/users/${user.id}`} className="font-medium hover:underline">
                      {user.name}
                    </Link>
                    {user.id === actor.userId ? (
                      <Badge variant="gold" className="ms-2">
                        {t("you")}
                      </Badge>
                    ) : null}
                    <p className="ltr-value text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roleAssignments.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{t("noRoles")}</span>
                      ) : (
                        user.roleAssignments.map((assignment, index) => (
                          <Badge key={index} variant="outline">
                            {localized(locale, assignment.role.nameAr, assignment.role.nameEn)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastLoginAt ? format.relativeTime(user.lastLoginAt) : t("never")}
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
