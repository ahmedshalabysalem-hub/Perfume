import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProductArt } from "@/components/store/product-art";
import { ProductCard } from "@/components/store/product-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import {
  getCurrentMarket,
  listStoreCategories,
  listStoreProducts,
} from "@/server/modules/storefront/storefront.service";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = await initLocale(params);
  const market = await getCurrentMarket();
  const t = await getTranslations("store");
  const [featured, categories] = await Promise.all([
    market ? listStoreProducts(market, { sort: "newest" }, locale) : null,
    listStoreCategories(),
  ]);
  const topCategories = categories.filter((category) => !category.parentId);

  return (
    <>
      <section className="relative overflow-hidden border-b bg-[radial-gradient(ellipse_at_top_right,_#efe5d4,_var(--background)_55%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div className="grid gap-6">
            <p className="text-xs tracking-[0.35em] text-gold uppercase">{t("hero.eyebrow")}</p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">{t("hero.title")}</h1>
            <p className="max-w-md text-lg text-muted-foreground">{t("hero.subtitle")}</p>
            <div>
              <Link href="/products" className={buttonVariants({ size: "lg", className: "rounded-full px-8" })}>
                {t("hero.cta")} <ArrowRight className="rtl:rotate-180" />
              </Link>
            </div>
          </div>
          <div className="mx-auto grid w-full max-w-md grid-cols-3 items-end gap-3">
            <ProductArt seed="hero-oud" family="OUD" label="" className="col-span-1 rounded-2xl shadow-sm" />
            <ProductArt
              seed="hero-rose-x"
              family="FLORAL"
              label=""
              className="col-span-1 -translate-y-8 rounded-2xl shadow-md"
            />
            <ProductArt seed="hero-amber-y" family="AMBER" label="" className="col-span-1 rounded-2xl shadow-sm" />
          </div>
        </div>
      </section>

      {featured && featured.products.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 className="font-display text-4xl">{t("featured")}</h2>
            <Link href="/products" className="text-sm font-medium text-gold hover:underline">
              {t("viewAll")}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {featured.products.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} market={market!} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h2 className="mb-6 font-display text-4xl">{t("shopByCategory")}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {topCategories.map((category) => (
            <Link
              key={category.id}
              href={`/products?category=${category.slug}`}
              className="group flex aspect-[4/3] items-end rounded-xl border bg-[linear-gradient(135deg,var(--card),#efe5d4)] p-5 transition hover:border-gold/60 hover:shadow-sm"
            >
              <span className="font-display text-2xl group-hover:text-gold">
                {localized(locale, category.nameAr, category.nameEn)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-3xl px-4 text-center sm:px-6">
        <h2 className="font-display text-4xl">{t("story.title")}</h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t("story.body")}</p>
      </section>
    </>
  );
}
