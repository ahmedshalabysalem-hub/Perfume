import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { StatusBadge } from "@/components/admin/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { getAssignmentOptions, getStaffUser } from "@/server/modules/access/users.service";
import { can } from "@/server/rbac/authorize";
import { isUuid } from "@/server/validation";
import { AssignRoleButton, ResetPasswordButton, RevokeAssignmentButton, UserStatusButton } from "../../user-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/access/users/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "users" });
  return { title: t("title") };
}

export default async function UserPage({ params }: PageProps<"/[locale]/admin/access/users/[id]">) {
  const locale = await initLocale(params);
  const { id } = await params;
  const actor = await getAdminPageActor("users.view");
  if (!actor) return <NoAccess />;
  if (!isUuid(id)) notFound();
  const ctx = { actor, meta: await getRequestMeta() };
  const user = await getStaffUser(ctx, id).catch(() => null);
  if (!user) notFound();
  const canManageAccount = can(actor, "users.manage", "global");
  const canAssign = can(actor, "users.manage");
  const options = canAssign ? await getAssignmentOptions(ctx) : null;
  const t = await getTranslations("users");
  const scopes = await getTranslations("scopes");
  const format = await getFormatter();
  const isSelf = user.id === actor.userId;

  const scopeLabel = (assignment: (typeof user.roleAssignments)[number]) => {
    switch (assignment.scopeType) {
      case "GLOBAL":
        return scopes("GLOBAL");
      case "COUNTRY":
        return `${scopes("COUNTRY")}: ${assignment.country ? localized(locale, assignment.country.nameAr, assignment.country.nameEn) : assignment.countryCode}`;
      case "LEGAL_ENTITY":
        return `${scopes("LEGAL_ENTITY")}: ${assignment.legalEntity?.code ?? "—"}`;
      case "STORE":
        return `${scopes("STORE")}: ${assignment.store ? `${assignment.store.code} · ${localized(locale, assignment.store.nameAr, assignment.store.nameEn)}` : "—"}`;
      case "WAREHOUSE":
        return `${scopes("WAREHOUSE")}: ${assignment.warehouse ? `${assignment.warehouse.code} · ${localized(locale, assignment.warehouse.nameAr, assignment.warehouse.nameEn)}` : "—"}`;
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/access/users" className={buttonVariants({ variant: "ghost", className: "mb-2 -ms-3" })}>
        <ArrowLeft className="rtl:rotate-180" /> {t("title")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user.name} <StatusBadge status={user.status} />
          </span>
        }
        description={<span className="ltr-value">{user.email}</span>}
        actions={
          canManageAccount && !isSelf ? (
            <>
              <ResetPasswordButton userId={user.id} />
              <UserStatusButton userId={user.id} status={user.status} />
            </>
          ) : null
        }
      />
      {user.mustChangePassword ? <Alert variant="warning" className="mb-4">{t("createHint")}</Alert> : null}
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="grid gap-1.5">
              <CardTitle>{t("assignments")}</CardTitle>
              <CardDescription>{t("assignmentsHint")}</CardDescription>
            </div>
            {options ? <AssignRoleButton userId={user.id} options={options} /> : null}
          </CardHeader>
          <CardContent>
            {user.roleAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRoles")}</p>
            ) : (
              <ul className="divide-y rounded-lg border" data-testid="assignments">
                {user.roleAssignments.map((assignment) => (
                  <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">{localized(locale, assignment.role.nameAr, assignment.role.nameEn)}</p>
                      <p className="text-sm text-muted-foreground">{scopeLabel(assignment)}</p>
                    </div>
                    {canAssign ? <RevokeAssignmentButton assignmentId={assignment.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <p>
              <span className="block text-muted-foreground">{t("lastLogin")}</span>
              {user.lastLoginAt ? format.dateTime(user.lastLoginAt, "long") : t("never")}
            </p>
            <p>
              <span className="block text-muted-foreground">{(await getTranslations("common"))("createdAt")}</span>
              {format.dateTime(user.createdAt, "long")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
