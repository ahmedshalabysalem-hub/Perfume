import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { NoAccess } from "@/components/admin/page-parts";
import { navigationFor } from "@/server/admin-nav";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { initLocale, metadataLocale } from "@/i18n/params";

export async function generateMetadata({ params }: LayoutProps<"/[locale]/admin">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: { default: t("adminTitle"), template: `%s · ${t("adminTitle")}` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  await initLocale(params);
  // Renders the shell for the first request; each page re-checks access itself.
  const actor = await getAdminPageActor();
  if (!actor) {
    return (
      <main id="main" className="min-h-dvh p-6">
        <NoAccess />
      </main>
    );
  }
  return (
    <AdminShell nav={navigationFor(actor)} user={{ name: actor.name, email: actor.email }}>
      {children}
    </AdminShell>
  );
}
