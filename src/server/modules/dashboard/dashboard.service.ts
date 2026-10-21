import "server-only";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { assertCan, can } from "@/server/rbac/authorize";

export type DashboardData = {
  publishedProducts: number;
  draftProducts: number;
  activeVariants: number;
  activeBrands: number;
  activeCategories: number;
  activeStaff: number | null;
  markets: Array<{
    countryCode: string;
    nameEn: string;
    nameAr: string;
    currencyCode: string;
    pricedVariants: number;
    publishedWithoutPrice: number;
  }>;
  variantsWithoutBarcode: number;
  productsMissingArabic: number;
  recentActivity: Array<{
    id: string;
    occurredAt: Date;
    action: string;
    entityType: string;
    summary: string | null;
    actorName: string | null;
  }> | null;
};

/**
 * KPI definitions (see docs/BUSINESS_RULES.md §Dashboard KPIs):
 *  - Active SKUs: variants with status ACTIVE (any product status).
 *  - Priced SKUs per market: ACTIVE variants with an ACTIVE price in that country.
 *  - Published without price: PUBLISHED products with no ACTIVE variant priced
 *    (actively) in that market — they are invisible to that market's customers.
 */
export async function getDashboardData(ctx: ServiceContext): Promise<DashboardData> {
  assertCan(ctx.actor, "dashboard.view");

  const [
    publishedProducts,
    draftProducts,
    activeVariants,
    activeBrands,
    activeCategories,
    variantsWithoutBarcode,
    productsMissingArabic,
  ] = await Promise.all([
    db.product.count({ where: { status: "PUBLISHED" } }),
    db.product.count({ where: { status: "DRAFT" } }),
    db.productVariant.count({ where: { status: "ACTIVE" } }),
    db.brand.count({ where: { isActive: true } }),
    db.category.count({ where: { isActive: true } }),
    db.productVariant.count({ where: { status: "ACTIVE", barcode: null } }),
    db.product.count({ where: { status: { in: ["DRAFT", "PUBLISHED"] }, descriptionAr: null } }),
  ]);

  const countries = await db.country.findMany({ where: { isActive: true }, orderBy: { code: "desc" } });
  const markets = await Promise.all(
    countries.map(async (country) => ({
      countryCode: country.code,
      nameEn: country.nameEn,
      nameAr: country.nameAr,
      currencyCode: country.currencyCode,
      pricedVariants: await db.productPrice.count({
        where: { countryCode: country.code, isActive: true, variant: { status: "ACTIVE" } },
      }),
      publishedWithoutPrice: await db.product.count({
        where: {
          status: "PUBLISHED",
          variants: {
            none: { status: "ACTIVE", prices: { some: { countryCode: country.code, isActive: true } } },
          },
        },
      }),
    })),
  );

  const activeStaff = can(ctx.actor, "users.view")
    ? await db.user.count({ where: { type: "STAFF", status: "ACTIVE" } })
    : null;

  let recentActivity: DashboardData["recentActivity"] = null;
  // The audit log is not partitioned by country: only GLOBAL auditors see it.
  if (can(ctx.actor, "audit.view", "global")) {
    const entries = await db.auditLog.findMany({ orderBy: { occurredAt: "desc" }, take: 8 });
    const actorIds = [...new Set(entries.map((entry) => entry.actorUserId).filter((id): id is string => !!id))];
    const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const names = new Map(actors.map((actor) => [actor.id, actor.name]));
    recentActivity = entries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      action: entry.action,
      entityType: entry.entityType,
      summary: entry.summary,
      actorName: entry.actorUserId ? (names.get(entry.actorUserId) ?? null) : null,
    }));
  }

  return {
    publishedProducts,
    draftProducts,
    activeVariants,
    activeBrands,
    activeCategories,
    activeStaff,
    markets,
    variantsWithoutBarcode,
    productsMissingArabic,
    recentActivity,
  };
}
