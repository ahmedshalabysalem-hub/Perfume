import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";

/**
 * Static security headers. The Content-Security-Policy is per-request (it
 * carries a nonce) and is therefore set in `src/proxy.ts`.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Cache Components is intentionally not enabled yet: the back office is
  // authenticated and fully dynamic, and per-request CSP nonces require
  // dynamic rendering. See docs/ARCHITECTURE.md (ADR-006).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["sharp", "bwip-js"],
  experimental: {
    serverActions: {
      // Product image uploads are limited to 5 MB by the service layer; the
      // extra headroom covers multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
  images: {
    // Uploaded images are served by our own route handler.
    localPatterns: [{ pathname: "/api/files/**" }, { pathname: "/images/**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
