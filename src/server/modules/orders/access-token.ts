import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Guest access to an order's confirmation (ADR-025). The token is an HMAC of
 * the order id under the server secret: unguessable, never stored, and
 * re-derivable when a retried checkout replays the same order. It travels
 * only in an httpOnly cookie, never in a URL, so it does not reach logs,
 * browser history or analytics. Rotating BETTER_AUTH_SECRET invalidates all
 * outstanding confirmation links, which is acceptable for a confirmation page.
 */

export const ORDER_ACCESS_DAYS = 30;

export function orderAccessToken(orderId: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(`order-access:v1:${orderId}`).digest("base64url");
}

/** Does any presented token grant access to `orderId`? Constant-time comparison. */
export function hasOrderAccess(orderId: string, presented: readonly string[]): boolean {
  const expected = Buffer.from(orderAccessToken(orderId));
  return presented.some((token) => {
    const candidate = Buffer.from(token);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
