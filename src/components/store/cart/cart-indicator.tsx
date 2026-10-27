"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cartUnitCount } from "@/lib/cart";
import { useCartLines } from "./cart-store";

/** Header cart link with the live number of units in the market's cart. */
export function CartIndicator({ market }: { market: string }) {
  const t = useTranslations("store.cart");
  const count = cartUnitCount(useCartLines(market));
  return (
    <Link
      href="/cart"
      className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-accent"
      aria-label={t("indicatorLabel", { count })}
      data-testid="cart-indicator"
    >
      <ShoppingBag className="size-5" aria-hidden="true" />
      {count > 0 ? (
        <span
          className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[0.7rem] leading-5 font-semibold text-gold-foreground tabular-nums"
          data-testid="cart-count"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
