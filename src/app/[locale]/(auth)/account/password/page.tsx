import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { redirect } from "@/i18n/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { ChangePasswordForm } from "./change-password-form";
import { initLocale, metadataLocale } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/password">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("changePasswordTitle"), robots: { index: false, follow: false } };
}

export default async function ChangePasswordPage({ params }: PageProps<"/[locale]/account/password">) {
  const locale = await initLocale(params);
  const actor = await getCurrentActor();
  if (!actor) return redirect({ href: { pathname: "/login" }, locale });

  const t = await getTranslations("auth");
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-display text-2xl font-medium">{t("changePasswordTitle")}</CardTitle>
        <CardDescription>{t("changePasswordSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {actor.mustChangePassword ? <Alert variant="warning">{t("mustChangePassword")}</Alert> : null}
        <ChangePasswordForm />
      </CardContent>
    </Card>
  );
}
