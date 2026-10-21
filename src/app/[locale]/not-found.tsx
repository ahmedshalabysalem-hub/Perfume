import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  const common = await getTranslations("common");
  return (
    <main id="main" className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="font-display text-7xl text-gold">404</p>
        <h1 className="mt-4 font-display text-3xl">{t("pageNotFound")}</h1>
        <p className="mt-3 text-muted-foreground">{t("pageNotFoundHint")}</p>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-8" })}>
          {common("home")}
        </Link>
      </div>
    </main>
  );
}
