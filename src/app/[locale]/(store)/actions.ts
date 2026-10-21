"use server";

import { cookies } from "next/headers";
import { listMarkets, MARKET_COOKIE } from "@/server/modules/storefront/storefront.service";

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
