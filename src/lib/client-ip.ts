/**
 * The client's address as seen by the outermost of `trustedHops` reverse
 * proxies in front of the app. Each proxy appends the address it received the
 * request from to X-Forwarded-For, so only the last `trustedHops` entries were
 * written by infrastructure we run; everything to their left is whatever the
 * client sent and can be forged. With no trusted proxy the header is entirely
 * client-controlled and no address is known (null).
 */
export function clientAddress(forwardedFor: string | null, trustedHops: number): string | null {
  if (trustedHops <= 0 || !forwardedFor) return null;
  const hops = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  // Fewer entries than proxies: the request did not come through all of them.
  if (hops.length < trustedHops) return null;
  const address = hops[hops.length - trustedHops]!;
  return /^[0-9A-Fa-f:.]{2,45}$/.test(address) ? address : null;
}
