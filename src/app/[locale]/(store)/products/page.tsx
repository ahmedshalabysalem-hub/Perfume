import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/shared/pagination";
import { ProductCard } from "@/components/store/product-card";
import { buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { localized } from "@/lib/utils";
import {
  getCurrentMarket,
  listStoreBrands,
  listStoreCategories,
  listStoreFamilies,
  listStoreProducts,
} from "@/server/modules/storefront/storefront.service";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "store.listing" });
  const slug = firstValue((await searchParams).category);
  const category = slug ? (await listStoreCategories()).find((candidate) => candidate.slug === slug) : undefined;
  // Category pages are worth indexing on their own; other filter combinations
  // canonicalise to the unfiltered listing.
  const suffix = category ? `?category=${category.slug}` : "";
  return {
    title: category ? localized(locale, category.nameAr, category.nameEn) : t("title"),
    alternates: {
      canonical: `/${locale}/products${suffix}`,
      languages: { ar: `/ar/products${suffix}`, en: `/en/products${suffix}`, "x-default": `/ar/products${suffix}` },
    },
  };
}

export default async function ProductListingPage({ params, searchParams }: PageProps<"/[locale]/products">) {
  const locale = await initLocale(params);
  const raw = await searchParams;
  const rawQuery = {
    q: firstValue(raw.q),
    category: firstValue(raw.category),
    brand: firstValue(raw.brand),
    audience: firstValue(raw.audience),
    family: firstValue(raw.family),
    sort: firstValue(raw.sort),
    page: firstValue(raw.page),
  };
  const market = await getCurrentMarket();
  const [result, categories, brands, families] = await Promise.all([
    market ? listStoreProducts(market, rawQuery, locale) : null,
    listStoreCategories(),
    listStoreBrands(),
    listStoreFamilies(),
  ]);
  const t = await getTranslations("store.listing");
  const common = await getTranslations("common");
  const audiences = await getTranslations("audience");

  const query = result?.query;
  const category = categories.find((candidate) => candidate.slug === query?.category);
  const brand = brands.find((candidate) => candidate.slug === query?.brand);
  const title = category
    ? localized(locale, category.nameAr, category.nameEn)
    : brand
      ? localized(locale, brand.nameAr, brand.nameEn)
      : t("title");
  const hasFilters = !!(query?.q || query?.category || query?.brand || query?.audience || query?.family);
  const selects = [
    {
      name: "category",
      label: t("category"),
      value: query?.category,
      options: categories.map((option) => ({
        value: option.slug,
        label: `${option.parentId ? "— " : ""}${localized(locale, option.nameAr, option.nameEn)}`,
      })),
    },
    {
      name: "brand",
      label: t("brand"),
      value: query?.brand,
      options: brands.map((option) => ({ value: option.slug, label: localized(locale, option.nameAr, option.nameEn) })),
    },
    {
      name: "audience",
      label: t("audience"),
      value: query?.audience,
      options: (["WOMEN", "MEN", "UNISEX"] as const).map((value) => ({ value, label: audiences(value) })),
    },
    {
      name: "family",
      label: t("family"),
      value: query?.family,
      options: families.map((option) => ({
        value: option.code,
        label: localized(locale, option.nameAr, option.nameEn),
      })),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl">{title}</h1>

      <form
        method="get"
        role="search"
        className="mt-6 grid gap-3 rounded-xl border bg-card p-3"
        data-testid="store-filters"
      >
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">{common("search")}</span>
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="q"
              defaultValue={query?.q}
              placeholder={t("searchPlaceholder")}
              className="ps-9"
              data-testid="store-search"
            />
          </label>
          <button type="submit" className={buttonVariants()}>
            {common("apply")}
          </button>
          {hasFilters ? (
            <Link href="/products" className={buttonVariants({ variant: "ghost" })}>
              {t("clear")}
            </Link>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {selects.map((select) => (
            <label key={select.name} className="grid gap-1 text-xs font-medium text-muted-foreground">
              {select.label}
              <NativeSelect name={select.name} defaultValue={select.value ?? ""} className="text-foreground">
                <option value="">{common("all")}</option>
                {select.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {common("sortBy")}
            <NativeSelect name="sort" defaultValue={query?.sort ?? "newest"} className="text-foreground">
              {(["newest", "priceAsc", "priceDesc", "name"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`sort.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </form>

      {!market || !result || result.products.length === 0 ? (
        <div className="mt-16 grid justify-items-center gap-4 text-center" data-testid="store-empty">
          <p className="text-lg text-muted-foreground">{t("empty")}</p>
          {hasFilters ? (
            <Link href="/products" className={buttonVariants({ variant: "outline" })}>
              {t("clear")}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {result.products.map((product) => (
              <ProductCard key={product.id} product={product} market={market} locale={locale} />
            ))}
          </div>
          <Pagination
            pathname="/products"
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            params={{
              q: result.query.q,
              category: result.query.category,
              brand: result.query.brand,
              audience: result.query.audience,
              family: result.query.family,
              sort: result.query.sort === "newest" ? undefined : result.query.sort,
            }}
          />
        </>
      )}
    </div>
  );
}
