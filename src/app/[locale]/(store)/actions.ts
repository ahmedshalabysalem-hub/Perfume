"use server";

import { cookies } from "next/headers";
import { runPublicAction } from "@/server/actions/run-public-action";
import type { ActionResult } from "@/server/actions/result";
import { InvalidStateError } from "@/server/errors";
import { db } from "@/server/db";
import { ORDER_ACCESS_DAYS } from "@/server/modules/orders/access-token";
import { priceCart, type PricedCart } from "@/server/modules/orders/cart.service";
import { placeOrder } from "@/server/modules/orders/checkout.service";
import { resolveOnlineStore } from "@/server/modules/orders/online-store";
import { getCurrentMarket, listMarkets, MARKET_COOKIE } from "@/server/modules/storefront/storefront.service";
import { consumeThrottle, type ThrottleRule } from "@/server/throttle";
import { ORDER_ACCESS_COOKIE, readOrderAccessTokens } from "./order-access";

const CART_THROTTLE: ThrottleRule = { name: "cart", limit: 120, windowSeconds: 60 };
/** Confirmation access for the browser's most recent orders only. */
const MAX_ACCESS_TOKENS = 5;

/** Remember the visitor's market (a preference cookie; never used for authorisation). */
export async function setMarketAction(code: string): Promise<void> {
  const markets = await listMarkets();
  if (!markets.some((market) => market.code === code)) return;
  (await cookies()).set(MARKET_COOKIE, code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * The cart a page shows was built for one market; if the visitor switched
 * market in another tab meanwhile, refuse rather than price it elsewhere.
 */
async function requireMarket(marketCode: unknown): Promise<string> {
  const market = await getCurrentMarket();
  if (!market || market.code !== marketCode) throw new InvalidStateError("errors.checkout.marketChanged");
  return market.code;
}

/** Authoritative prices, availability and totals for the browser's cart. */
export async function priceCartAction(marketCode: string, lines: unknown): Promise<ActionResult<PricedCart>> {
  return runPublicAction("storefront.cart", async (ctx) => {
    const countryCode = await requireMarket(marketCode);
    await consumeThrottle(CART_THROTTLE, ctx.meta.ipAddress ?? "unknown");
    const store = await resolveOnlineStore(db, countryCode);
    if (!store) throw new InvalidStateError("errors.checkout.unavailable");
    return priceCart(db, store, lines);
  });
}

/**
 * Place a guest order. On success the confirmation access token goes into an
 * httpOnly cookie (never the URL or the response body); the browser only
 * learns the order number to navigate to.
 */
export async function placeOrderAction(
  marketCode: string,
  input: unknown,
): Promise<ActionResult<{ orderNumber: string }>> {
  return runPublicAction("storefront.checkout", async (ctx) => {
    const countryCode = await requireMarket(marketCode);
    const placed = await placeOrder(ctx, countryCode, input);
    const jar = await cookies();
    const tokens = [placed.accessToken, ...readOrderAccessTokens(jar.get(ORDER_ACCESS_COOKIE)?.value)];
    jar.set(ORDER_ACCESS_COOKIE, [...new Set(tokens)].slice(0, MAX_ACCESS_TOKENS).join("."), {
      path: "/",
      maxAge: ORDER_ACCESS_DAYS * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    return { orderNumber: placed.orderNumber };
  });
}
