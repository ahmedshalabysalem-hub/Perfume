import { getTranslations } from "next-intl/server";
import { initLocale } from "@/i18n/params";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await initLocale(params);
  const t = await getTranslations("store.hero");
  return (
    <main id="main" className="mx-auto max-w-5xl px-6 py-24 text-center">
      <p className="text-sm tracking-[0.3em] text-gold uppercase">{t("eyebrow")}</p>
      <h1 className="mt-4 font-display text-5xl">{t("title")}</h1>
      <p className="mt-6 text-muted-foreground">{t("subtitle")}</p>
    </main>
  );
}
