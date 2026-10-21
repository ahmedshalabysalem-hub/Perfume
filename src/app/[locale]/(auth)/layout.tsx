import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/params";

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  await initLocale(params);
  const t = await getTranslations("metadata");
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_var(--accent),_var(--background)_60%)]">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" className="font-display text-2xl tracking-wide">
          {t("storeName")}
        </Link>
        <LocaleSwitcher />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:pt-16">
        {children}
      </main>
    </div>
  );
}
