import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { cn, localized } from "@/lib/utils";
import type { Market, StoreProductCard } from "@/server/modules/storefront/storefront.service";
import { publicFileUrl } from "@/lib/files";
import { QuickAddButton } from "./cart/add-to-cart";
import { ProductArt } from "./product-art";

export async function ProductCard({
  product,
  market,
  locale,
}: {
  product: StoreProductCard;
  market: Market;
  locale: string;
}) {
  const t = await getTranslations("store.product");
  const name = localized(locale, product.nameAr, product.nameEn);
  const price = formatMoney(product.minPrice, market.currencyCode, locale, market.minorUnits);
  const href = `/products/${product.slug}`;
  return (
    <div className="group flex flex-col gap-3" data-testid="product-card">
      <Link href={href} className="flex flex-1 flex-col gap-3 focus-visible:outline-none">
        <div className="relative aspect-[5/6] overflow-hidden rounded-xl bg-muted ring-gold/40 transition group-hover:shadow-md group-has-[a:focus-visible]:ring-2">
          {product.imageKey ? (
            <Image
              src={publicFileUrl(product.imageKey)}
              alt={localized(locale, product.imageAltAr, product.imageAltEn) || name}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <ProductArt
              seed={product.slug}
              family={product.familyCode}
              label={t("illustrationAlt", { name })}
              className="size-full transition duration-500 group-hover:scale-[1.03]"
            />
          )}
        </div>
        <div className="grid gap-1 text-center">
          <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
            {localized(locale, product.brandNameAr, product.brandNameEn)}
          </p>
          <h3 className="font-display text-xl leading-snug group-hover:text-gold">{name}</h3>
          {product.concentrationEn ? (
            <p className="text-xs text-muted-foreground">
              {localized(locale, product.concentrationAr, product.concentrationEn)}
            </p>
          ) : null}
          <p className="mt-1 text-sm">
            <span className="font-semibold tabular-nums" data-testid="price">
              {product.variantCount > 1 ? t("from", { price }) : price}
            </span>
            {product.compareAtPrice ? (
              <span className="ms-2 text-muted-foreground tabular-nums line-through">
                {formatMoney(product.compareAtPrice, market.currencyCode, locale, market.minorUnits)}
              </span>
            ) : null}
          </p>
        </div>
      </Link>
      {product.singleVariantId ? (
        <QuickAddButton
          market={market.code}
          variantId={product.singleVariantId}
          inStock={product.singleVariantInStock}
          name={name}
        />
      ) : (
        <Link
          href={href}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
          data-testid="choose-size"
        >
          {t("chooseSize")}
        </Link>
      )}
    </div>
  );
}
