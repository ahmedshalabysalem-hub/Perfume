import { getSessionCookie } from "better-auth/cookies";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

const ADMIN_PATH = new RegExp(`^/(${routing.locales.join("|")})/admin(?:/|$)`);

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // Next.js applies the nonce to its own scripts; 'strict-dynamic' trusts
    // scripts they load. React needs 'unsafe-eval' only in development.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by Radix/Sonner positioning; scripts
    // stay locked down, which is where XSS risk lives.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Runs before every page request:
 *  1. assigns a correlation id and a per-request CSP nonce,
 *  2. optimistically redirects signed-out visitors away from /admin (a
 *     cookie-presence check only — the admin layout and every Server Action
 *     verify the session and permissions against the database),
 *  3. resolves the locale (next-intl).
 */
export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const adminMatch = ADMIN_PATH.exec(request.nextUrl.pathname);
  if (adminMatch && !getSessionCookie(request, { cookiePrefix: "perfume" })) {
    const loginUrl = new URL(`/${adminMatch[1]}/login`, request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("x-request-id", requestId);
    return redirect;
  }

  // next-intl forwards a copy of the request headers to the app, so values set
  // here reach Server Components (Next.js reads the nonce from the request CSP).
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  request.headers.set("x-request-id", requestId);
  request.headers.set("x-pathname", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = handleI18nRouting(request);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  // Pages only: API routes, Next.js assets and files with an extension are skipped.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
