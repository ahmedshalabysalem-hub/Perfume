import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { listPublishedSlugs, listStoreCategories } from "@/server/modules/storefront/storefront.service";

// Reads the catalogue at request time (never prerendered at build time).
export const dynamic = "force-dynamic";

function entry(base: string, path: string, lastModified?: Date): MetadataRoute.Sitemap[number] {
  return {
    url: `${base}/${routing.defaultLocale}${path}`,
    lastModified,
    alternates: {
      languages: Object.fromEntries(routing.locales.map((locale) => [locale, `${base}/${locale}${path}`])),
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const [products, categories] = await Promise.all([listPublishedSlugs(), listStoreCategories()]);
  return [
    entry(base, ""),
    entry(base, "/products"),
    ...categories.map((category) => entry(base, `/products?category=${category.slug}`)),
    ...products.map((product) => entry(base, `/products/${product.slug}`, product.updatedAt)),
  ];
}
