/** Cookie holding confirmation access tokens of the browser's recent orders (ADR-025). */
export const ORDER_ACCESS_COOKIE = "order_access";

/** Tokens are base64url HMACs joined by "."; anything else is ignored. */
export function readOrderAccessTokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(".")
    .filter((token) => /^[A-Za-z0-9_-]{43}$/.test(token))
    .slice(0, 10);
}
