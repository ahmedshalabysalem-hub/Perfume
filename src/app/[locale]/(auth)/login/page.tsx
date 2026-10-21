import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { safeAdminRedirect } from "@/lib/safe-redirect";
import { getCurrentActor } from "@/server/auth/session";
import { can } from "@/server/rbac/authorize";
import { LoginForm } from "./login-form";
import { initLocale, metadataLocale } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signIn"), robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const locale = await initLocale(params);
  const query = await searchParams;
  const next = safeAdminRedirect(typeof query.next === "string" ? query.next : null, locale);

  // Already signed in with back-office access: skip the form.
  const actor = await getCurrentActor();
  if (actor && can(actor, "admin.access")) redirect(next);

  const t = await getTranslations("auth");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-display text-2xl font-medium">{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} />
      </CardContent>
    </Card>
  );
}
