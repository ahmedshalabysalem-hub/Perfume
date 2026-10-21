import { ChevronRight, Info } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { Price } from "@/components/store/price";
import { ProductArt } from "@/components/store/product-art";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { publicFileUrl } from "@/lib/files";
import { cn, localized } from "@/lib/utils";
import { getCurrentMarket, getStoreProduct } from "@/server/modules/storefront/storefront.service";

const NOTE_LAYERS = ["TOP", "HEART", "BASE"] as const;

/** Shared by generateMetadata and the page: one query per request. */
const loadProduct = cache(async (slug: string) => getStoreProduct(slug, await getCurrentMarket()));

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return {};
  const name = localized(locale, product.nameAr, product.nameEn);
  const image = product.images[0];
  return {
    title: localized(locale, product.seoTitleAr, product.seoTitleEn) || name,
    description:
      localized(locale, product.seoDescriptionAr, product.seoDescriptionEn) ||
      localized(locale, product.shortDescriptionAr, product.shortDescriptionEn) ||
      undefined,
    alternates: {
      canonical: `/${locale}/products/${product.slug}`,
      languages: {
        ar: `/ar/products/${product.slug}`,
        en: `/en/products/${product.slug}`,
        "x-default": `/ar/products/${product.slug}`,
      },
    },
    openGraph: { title: name, images: image ? [{ url: publicFileUrl(image.storageKey) }] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[locale]/products/[slug]">) {
  const locale = await initLocale(params);
  const { slug } = await params;
  const [product, market] = await Promise.all([loadProduct(slug), getCurrentMarket()]);
  if (!product) notFound();

  const t = await getTranslations("store");
  const layers = await getTranslations("noteLayer");
  const audiences = await getTranslations("audience");
  const variantText = await getTranslations("variants");

  const requested = firstValue((await searchParams).v);
  const selected =
    product.variants.find((variant) => variant.id === requested) ??
    product.sellableVariants[0] ??
    product.variants[0] ??
    null;
  const name = localized(locale, product.nameAr, product.nameEn);
  const brandName = localized(locale, product.brand.nameAr, product.brand.nameEn);
  const countryName = market ? localized(locale, market.nameAr, market.nameEn) : "";
  const variantLabel = (variant: (typeof product.variants)[number]) => {
    const label =
      localized(locale, variant.nameAr, variant.nameEn) ||
      (variant.sizeMl ? variantText("ml", { size: variant.sizeMl.replace(/\.0+$/, "") }) : variant.sku);
    return variant.isTester ? `${label} · ${t("product.tester")}` : label;
  };

  const description = localized(locale, product.descriptionAr, product.descriptionEn);
  const shortDescription = localized(locale, product.shortDescriptionAr, product.shortDescriptionEn);
  const ingredients = localized(locale, product.ingredientsAr, product.ingredientsEn);
  const warnings = [
    localized(locale, product.warningsAr, product.warningsEn),
    localized(locale, product.storageInstructionsAr, product.storageInstructionsEn),
  ]
    .filter(Boolean)
    .join("\n\n");
  const origin = product.countryOfOriginCode
    ? new Intl.DisplayNames([locale], { type: "region" }).of(product.countryOfOriginCode)
    : undefined;
  const details = [
    {
      label: t("product.concentration"),
      value: product.concentration
        ? localized(locale, product.concentration.nameAr, product.concentration.nameEn)
        : null,
    },
    {
      label: t("product.family"),
      value: product.family ? localized(locale, product.family.nameAr, product.family.nameEn) : null,
    },
    { label: t("listing.audience"), value: product.audience ? audiences(product.audience) : null },
    { label: t("product.launchYear"), value: product.launchYear ? String(product.launchYear) : null },
    { label: t("product.origin"), value: origin ?? null },
  ].filter((detail): detail is { label: string; value: string } => !!detail.value);
  const notesByLayer = NOTE_LAYERS.map((layer) => ({
    layer,
    notes: product.notes
      .filter((entry) => entry.layer === layer)
      .map((entry) => localized(locale, entry.note.nameAr, entry.note.nameEn)),
  })).filter((group) => group.notes.length > 0);

  // Structured data. Only manufacturer barcodes are declared as GTINs —
  // internal codes are not GS1 identifiers. Availability is omitted until
  // inventory is tracked (Phase 2) rather than claiming stock we cannot verify.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: shortDescription || undefined,
    brand: { "@type": "Brand", name: brandName },
    sku: selected?.sku,
    gtin: selected?.barcodeSource === "MANUFACTURER" && selected.barcode ? selected.barcode : undefined,
    image: product.images.map((image) => publicFileUrl(image.storageKey)),
    offers:
      market && product.sellableVariants.length > 0
        ? product.sellableVariants.map((variant) => ({
            "@type": "Offer",
            sku: variant.sku,
            price: variant.price,
            priceCurrency: market.currencyCode,
            eligibleRegion: market.code,
          }))
        : undefined,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script
        type="application/ld+json"
        nonce={nonce}
        // JSON.stringify output with "<" escaped cannot break out of the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav
        aria-label={t("product.breadcrumbShop")}
        className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/products" className="hover:text-foreground">
          {t("product.breadcrumbShop")}
        </Link>
        {product.primaryCategory ? (
          <>
            <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
            <Link href={`/products?category=${product.primaryCategory.slug}`} className="hover:text-foreground">
              {localized(locale, product.primaryCategory.nameAr, product.primaryCategory.nameEn)}
            </Link>
          </>
        ) : null}
        <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">
          {name}
        </span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="grid content-start gap-3">
          <div className="relative aspect-[5/6] overflow-hidden rounded-2xl bg-muted">
            {product.images[0] ? (
              <Image
                src={publicFileUrl(product.images[0].storageKey)}
                alt={localized(locale, product.images[0].altAr, product.images[0].altEn) || name}
                fill
                priority
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <ProductArt
                seed={product.slug}
                family={product.family?.code ?? null}
                label={t("product.illustrationAlt", { name })}
                className="size-full"
              />
            )}
          </div>
          {product.images.length > 1 ? (
            <div className="grid grid-cols-4 gap-3">
              {product.images.slice(1, 5).map((image) => (
                <div key={image.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={publicFileUrl(image.storageKey)}
                    alt={localized(locale, image.altAr, image.altEn) || name}
                    fill
                    sizes="12vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <Link
              href={`/products?brand=${product.brand.slug}`}
              className="text-xs tracking-[0.25em] text-gold uppercase hover:underline"
            >
              {brandName}
            </Link>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl" data-testid="product-name">
              {name}
            </h1>
            {product.concentration ? (
              <p className="text-muted-foreground">
                {localized(locale, product.concentration.nameAr, product.concentration.nameEn)}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1" data-testid="product-price">
            {selected?.price && market ? (
              <>
                <Price
                  amount={selected.price}
                  compareAt={selected.compareAtPrice}
                  currency={market.currencyCode}
                  locale={locale}
                  minorUnits={market.minorUnits}
                  className="text-2xl"
                />
                <p className="text-sm text-success">{t("product.availableIn", { country: countryName })}</p>
              </>
            ) : (
              <p className="text-muted-foreground" data-testid="not-available">
                {t("product.notAvailableIn", { country: countryName })}
              </p>
            )}
          </div>

          {product.variants.length > 0 ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("product.size")}</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const isSelected = variant.id === selected?.id;
                  return (
                    <Link
                      key={variant.id}
                      href={{ pathname: `/products/${product.slug}`, query: { v: variant.id } }}
                      replace
                      scroll={false}
                      aria-current={isSelected ? "true" : undefined}
                      data-testid="variant-option"
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition",
                        isSelected ? "border-foreground bg-foreground text-background" : "hover:border-foreground/60",
                        !variant.price && "text-muted-foreground line-through decoration-1",
                      )}
                    >
                      {variantLabel(variant)}
                    </Link>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {market ? (
            <p
              className="flex gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm"
              data-testid="ordering-notice"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
              {market.pricesIncludeTax
                ? t("product.orderingNotice", { country: countryName })
                : t("product.orderingNoticeExclusive", { country: countryName })}
            </p>
          ) : null}

          {shortDescription ? <p className="text-lg leading-relaxed">{shortDescription}</p> : null}

          {notesByLayer.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="font-display text-2xl">{t("product.notes")}</h2>
              <dl className="grid gap-3 sm:grid-cols-3">
                {notesByLayer.map((group) => (
                  <div key={group.layer} className="rounded-lg border bg-card p-3">
                    <dt className="text-xs tracking-wide text-muted-foreground uppercase">{layers(group.layer)}</dt>
                    <dd className="mt-1 text-sm">{group.notes.join(locale === "ar" ? "، " : ", ")}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {details.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="font-display text-2xl">{t("product.details")}</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {details.map((detail) => (
                  <div key={detail.label} className="contents">
                    <dt className="text-muted-foreground">{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {description ? (
            <section className="grid gap-3">
              <h2 className="font-display text-2xl">{t("product.description")}</h2>
              <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{description}</p>
            </section>
          ) : null}

          {ingredients || warnings ? (
            <div className="divide-y rounded-lg border">
              {ingredients ? (
                <details className="group p-4">
                  <summary className="cursor-pointer font-medium">{t("product.ingredients")}</summary>
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground" dir="auto">
                    {ingredients}
                  </p>
                </details>
              ) : null}
              {warnings ? (
                <details className="group p-4">
                  <summary className="cursor-pointer font-medium">{t("product.warnings")}</summary>
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{warnings}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
