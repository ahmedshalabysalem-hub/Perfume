import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { safeAdminRedirect } from "@/lib/safe-redirect";
import { getCurrentActor } from "@/server/auth/session";
import { getPreferredLocale } from "@/server/modules/access/preferences.service";
import { can } from "@/server/rbac/authorize";
import { LoginForm } from "./login-form";
import { initLocale, metadataLocale } from "@/i18n/params";
import { LOCALE_COOKIE } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signIn"), robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const locale = await initLocale(params);
  const query = await searchParams;
  const requested = typeof query.next === "string" ? query.next : null;
  const next = safeAdminRedirect(requested, locale);

  // Already signed in with back-office access: skip the form. Without an
  // explicit target, a device that has never chosen a language (no locale
  // cookie) opens the back office in the language saved on the account; a
  // choice made on this device wins.
  const actor = await getCurrentActor();
  if (actor && can(actor, "admin.access")) {
    if (requested) redirect(next);
    const deviceChoice = (await cookies()).has(LOCALE_COOKIE);
    const home = deviceChoice ? locale : ((await getPreferredLocale(actor.userId)) ?? locale);
    redirect(safeAdminRedirect(null, home));
  }

  const t = await getTranslations("auth");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-display text-2xl font-medium">{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={requested ? next : null} />
      </CardContent>
    </Card>
  );
}
