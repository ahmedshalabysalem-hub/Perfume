/**
 * Validate a post-login `next` target to prevent open redirects: only
 * same-origin absolute paths within the back office are accepted.
 */
export function safeAdminRedirect(next: string | null | undefined, locale: string): string {
  const fallback = `/${locale}/admin`;
  if (!next) return fallback;
  // Reject protocol-relative ("//evil"), backslash tricks and anything that is not a path.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n\t]/.test(next)) {
    return fallback;
  }
  try {
    const url = new URL(next, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return fallback;
    if (!/^\/(ar|en)\/admin(\/|$)/.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
