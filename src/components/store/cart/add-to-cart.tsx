"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useHydrated } from "@/components/forms/use-hydrated";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { CART_MAX_QUANTITY } from "@/lib/schemas/checkout";
import { cn } from "@/lib/utils";
import { cartStore } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";

type Availability = "IN_STOCK" | "OUT_OF_STOCK" | "CLOSED";

function useAddToCart(market: string) {
  const t = useTranslations("store.cart");
  const router = useRouter();
  return (variantId: string, quantity: number, name: string) => {
    const before = cartStore.lines(market).find((line) => line.variantId === variantId)?.quantity ?? 0;
    const after = cartStore.add(market, variantId, quantity);
    const action = { label: t("viewCart"), onClick: () => router.push("/cart") };
    if (after - before < quantity) {
      toast.warning(t("maxReached", { max: CART_MAX_QUANTITY }), { action });
    } else {
      toast.success(t("added", { name }), { action });
    }
  };
}

/** Quantity and "Add to cart" for the selected variant on the product page. */
export function AddToCart({
  market,
  variantId,
  availability,
  name,
}: {
  market: string;
  variantId: string | null;
  availability: Availability;
  name: string;
}) {
  const t = useTranslations("store.cart");
  const hydrated = useHydrated();
  const add = useAddToCart(market);
  const [quantity, setQuantity] = useState(1);
  const canAdd = !!variantId && availability === "IN_STOCK";

  return (
    <div className="grid gap-3" data-testid="add-to-cart">
      {canAdd ? (
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} label={t("quantity")} />
          <Button
            type="button"
            variant="gold"
            size="lg"
            className="min-w-48 flex-1 sm:flex-none"
            disabled={!hydrated}
            onClick={() => {
              add(variantId, quantity, name);
              setQuantity(1);
            }}
            data-testid="add-to-cart-button"
          >
            <ShoppingBag aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" variant="outline" disabled className="w-full sm:w-auto">
          {availability === "CLOSED" ? t("checkoutClosed") : t("outOfStock")}
        </Button>
      )}
    </div>
  );
}

/** One-tap add on a product card (single-variant products only). */
export function QuickAddButton({
  market,
  variantId,
  inStock,
  name,
  className,
}: {
  market: string;
  variantId: string;
  inStock: boolean;
  name: string;
  className?: string;
}) {
  const t = useTranslations("store.cart");
  const hydrated = useHydrated();
  const add = useAddToCart(market);
  return (
    <Button
      type="button"
      variant={inStock ? "default" : "outline"}
      size="sm"
      className={cn("w-full", className)}
      disabled={!hydrated || !inStock}
      onClick={() => add(variantId, 1, name)}
      data-testid="quick-add"
    >
      {inStock ? (
        <>
          <ShoppingBag aria-hidden="true" />
          {t("add")}
        </>
      ) : (
        t("unavailableNow")
      )}
    </Button>
  );
}
