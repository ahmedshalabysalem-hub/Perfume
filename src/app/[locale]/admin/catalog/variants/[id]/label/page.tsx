import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { formatMoney } from "@/lib/money";
import { cn, localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { db } from "@/server/db";
import { barcodeSvgDataUri } from "@/server/modules/catalog/barcode-render";
import { isUuid } from "@/server/validation";
import { PrintButton } from "./print-button";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/catalog/variants/[id]/label">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "variants.label" });
  return { title: t("title") };
}

export default async function VariantLabelPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/catalog/variants/[id]/label">) {
  const locale = await initLocale(params);
  const { id } = await params;
  const actor = await getAdminPageActor("products.view");
  if (!actor) return <NoAccess />;
  if (!isUuid(id)) notFound();

  const variant = await db.productVariant.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, nameEn: true, nameAr: true, brand: { select: { nameEn: true, nameAr: true } } } },
      prices: {
        where: { isActive: true },
        include: { country: { select: { nameEn: true, nameAr: true } }, currency: { select: { minorUnits: true } } },
      },
    },
  });
  if (!variant || !variant.barcode || !variant.barcodeType) notFound();
  const barcode = variant.barcode;

  const query = await searchParams;
  const copies = Math.min(
    48,
    Math.max(1, Number.parseInt(typeof query.copies === "string" ? query.copies : "1", 10) || 1),
  );
  const market = typeof query.market === "string" ? query.market.toUpperCase() : null;
  const price = market ? variant.prices.find((candidate) => candidate.countryCode === market) : undefined;
  const image = barcodeSvgDataUri(barcode, variant.barcodeType);
  const t = await getTranslations("variants");
  const label =
    localized(locale, variant.nameAr, variant.nameEn) ||
    (variant.sizeMl ? t("ml", { size: Number(variant.sizeMl).toString() }) : "");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-6 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/admin/catalog/products/${variant.product.id}?tab=variants`}
            className={buttonVariants({ variant: "ghost" })}
          >
            <ArrowLeft className="rtl:rotate-180" /> {localized(locale, variant.product.nameAr, variant.product.nameEn)}
          </Link>
          <PrintButton label={t("label.print")} />
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 text-sm">
          <label className="grid gap-1">
            {t("label.copies")}
            <input
              name="copies"
              type="number"
              min={1}
              max={48}
              defaultValue={copies}
              className="h-9 w-24 rounded-md border px-2"
            />
          </label>
          <label className="grid gap-1">
            {t("prices")}
            <select name="market" defaultValue={market ?? ""} className="h-9 rounded-md border px-2">
              <option value="">—</option>
              {variant.prices.map((candidate) => (
                <option key={candidate.countryCode} value={candidate.countryCode}>
                  {localized(locale, candidate.country.nameAr, candidate.country.nameEn)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            {(await getTranslations("common"))("apply")}
          </button>
        </form>
        <p className="text-sm text-muted-foreground">{t("label.hint")}</p>
        {variant.barcodeSource === "INTERNAL" ? <Alert variant="info">{t("label.internalNotice")}</Alert> : null}
      </div>

      <div className="flex flex-wrap gap-[2mm]" data-testid="label-sheet">
        {Array.from({ length: copies }, (_, index) => (
          <div
            key={index}
            className={cn(
              "flex h-[30mm] w-[50mm] flex-col items-center justify-between overflow-hidden rounded-sm border border-black/40 bg-white p-[1.5mm] text-black print:break-inside-avoid",
            )}
          >
            <p className="w-full truncate text-center text-[7pt] leading-tight font-semibold">
              {localized(locale, variant.product.brand.nameAr, variant.product.brand.nameEn)} ·{" "}
              {localized(locale, variant.product.nameAr, variant.product.nameEn)}
            </p>
            <p className="w-full truncate text-center text-[6.5pt] leading-tight">
              {label} · <span className="ltr-value">{variant.sku}</span>
            </p>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated SVG barcode for printing
              <img src={image} alt={barcode} className="h-[15mm] max-w-full object-contain" />
            ) : null}
            {price ? (
              <p className="text-[8pt] font-bold">
                {formatMoney(price.amount.toFixed(2), price.currencyCode, locale, price.currency.minorUnits)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
