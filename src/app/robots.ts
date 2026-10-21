import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ar/admin", "/en/admin", "/ar/login", "/en/login", "/ar/account", "/en/account"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
