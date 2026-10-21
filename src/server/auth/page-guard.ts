import "server-only";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import type { UserActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import type { PermissionKey } from "@/server/rbac/permissions";
import { getCurrentActor } from "./session";

/**
 * Guard for back-office pages. Must be called by every admin page (layouts do
 * not re-render on client navigation, so a layout check alone is not enough).
 *
 *  - signed out              → redirect to the login page (with `next`)
 *  - temporary password      → redirect to the change-password page
 *  - no `admin.access` or no `permission` → null (render <NoAccess />)
 */
export async function getAdminPageActor(permission?: PermissionKey): Promise<UserActor | null> {
  const actor = await getCurrentActor();
  const locale = await getLocale();
  if (!actor) {
    const requestHeaders = await headers();
    const next = requestHeaders.get("x-pathname") ?? `/${locale}/admin`;
    return redirect({ href: { pathname: "/login", query: { next } }, locale });
  }
  if (actor.mustChangePassword) {
    return redirect({ href: "/account/password", locale });
  }
  if (!can(actor, "admin.access")) return null;
  if (permission && !can(actor, permission, "any")) return null;
  return actor;
}
