"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { priceCartAction } from "@/app/[locale]/(store)/actions";
import type { CartLine } from "@/lib/cart";
import type { ActionError } from "@/server/actions/result";
import type { PricedCart } from "@/server/modules/orders/cart.service";

/**
 * Ask the server to price the cart whenever its contents change (debounced).
 * Only the latest request's answer is kept, so a slow response never
 * overwrites a newer one.
 */
export function usePricedCart(market: string, lines: CartLine[], enabled: boolean) {
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [error, setError] = useState<ActionError | "network" | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRef(0);
  const linesKey = JSON.stringify(lines);

  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    setPending(true);
    try {
      const result = await priceCartAction(market, JSON.parse(linesKey));
      if (id !== sequence.current) return;
      if (result.ok) {
        setPriced(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch {
      if (id === sequence.current) setError("network");
    } finally {
      if (id === sequence.current) setPending(false);
    }
  }, [market, linesKey]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timer);
  }, [enabled, refresh]);

  /** The server's answer describes exactly the lines the browser holds now. */
  const current =
    !!priced &&
    priced.lines.length === lines.length &&
    priced.lines.every(
      (line, index) => line.variantId === lines[index]?.variantId && line.quantity === lines[index]?.quantity,
    );

  return { priced, current, pending, error, refresh };
}
