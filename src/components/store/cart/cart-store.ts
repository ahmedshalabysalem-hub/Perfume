"use client";

import { useSyncExternalStore } from "react";
import { addToCart, sanitizeCartLines, setCartQuantity, type CartLine } from "@/lib/cart";

/**
 * The guest cart lives in localStorage, one cart per market (ADR-025): only
 * variant ids and quantities, kept for 30 days after the last change. Prices,
 * names, stock and totals always come from the server. Tabs stay in sync via
 * the `storage` event; storage may be unavailable (private mode, blocked),
 * in which case the cart simply lives for the page view.
 */

const KEY_PREFIX = "perfume.cart.v1.";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY: CartLine[] = [];

const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();
const snapshots = new Map<string, { raw: string | null; lines: CartLine[] }>();

function storageKey(market: string) {
  return `${KEY_PREFIX}${market}`;
}

function readRaw(market: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(market));
  } catch {
    return memory.get(market) ?? null;
  }
}

function readLines(market: string): CartLine[] {
  const raw = readRaw(market);
  const cached = snapshots.get(market);
  if (cached && cached.raw === raw) return cached.lines;
  let lines: CartLine[] = EMPTY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { lines?: unknown; updatedAt?: unknown };
      if (typeof parsed.updatedAt === "number" && Date.now() - parsed.updatedAt < TTL_MS) {
        lines = sanitizeCartLines(parsed.lines);
      }
    } catch {
      lines = EMPTY;
    }
  }
  snapshots.set(market, { raw, lines });
  return lines;
}

function writeLines(market: string, lines: CartLine[]) {
  const raw = lines.length > 0 ? JSON.stringify({ lines, updatedAt: Date.now() }) : null;
  try {
    if (raw) window.localStorage.setItem(storageKey(market), raw);
    else window.localStorage.removeItem(storageKey(market));
  } catch {
    memory.set(market, raw);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(KEY_PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The market's cart lines; empty on the server and before hydration. */
export function useCartLines(market: string | null): CartLine[] {
  return useSyncExternalStore(
    subscribe,
    () => (market ? readLines(market) : EMPTY),
    () => EMPTY,
  );
}

export const cartStore = {
  lines: readLines,
  /** Add to the cart; returns the line's quantity afterwards (capped). */
  add(market: string, variantId: string, quantity: number): number {
    const lines = addToCart(readLines(market), variantId, quantity);
    writeLines(market, lines);
    return lines.find((line) => line.variantId === variantId.toLowerCase())?.quantity ?? 0;
  },
  setQuantity(market: string, variantId: string, quantity: number) {
    writeLines(market, setCartQuantity(readLines(market), variantId, quantity));
  },
  remove(market: string, variantId: string) {
    writeLines(market, setCartQuantity(readLines(market), variantId, 0));
  },
  clear(market: string) {
    writeLines(market, EMPTY);
  },
};
