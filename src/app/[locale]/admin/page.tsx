import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { getDashboardData } from "@/server/modules/dashboard/dashboard.service";
import { initLocale, metadataLocale } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const locale = await metadataLocale(params);
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

function Kpi({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <Card className="h-full transition-colors hover:border-gold/50">
      <CardContent className="grid gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-4xl lining-nums tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
      {content}
    </Link>
  ) : (
    content
  );
}

export default async function DashboardPage({ params }: PageProps<"/[locale]/admin">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("dashboard.view");
  if (!actor) return <NoAccess />;

  const data = await getDashboardData({ actor, meta: await getRequestMeta() });
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const healthIssues = [
    ...data.markets
      .filter((market) => market.publishedWithoutPrice > 0)
      .map((market) => ({
        key: `price-${market.countryCode}`,
        label: t("publishedWithoutPrice", { market: localized(locale, market.nameAr, market.nameEn) }),
        count: market.publishedWithoutPrice,
      })),
    ...(data.variantsWithoutBarcode > 0
      ? [{ key: "barcode", label: t("variantsWithoutBarcode"), count: data.variantsWithoutBarcode }]
      : []),
    ...(data.productsMissingArabic > 0
      ? [{ key: "arabic", label: t("productsMissingArabic"), count: data.productsMissingArabic }]
      : []),
  ];

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader title={t("welcome", { name: actor.name })} description={t("subtitle")} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label={t("publishedProducts")}
          value={data.publishedProducts}
          href="/admin/catalog/products?status=PUBLISHED"
        />
        <Kpi label={t("draftProducts")} value={data.draftProducts} href="/admin/catalog/products?status=DRAFT" />
        <Kpi label={t("activeVariants")} value={data.activeVariants} />
        <Kpi label={t("brands")} value={data.activeBrands} href="/admin/catalog/brands" />
        <Kpi label={t("categories")} value={data.activeCategories} href="/admin/catalog/categories" />
        {data.activeStaff !== null ? (
          <Kpi label={t("staffUsers")} value={data.activeStaff} href="/admin/access/users" />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("marketCoverage")}</CardTitle>
            <CardDescription>{t("marketCoverageHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.markets.map((market) => (
              <div key={market.countryCode} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="font-medium">{localized(locale, market.nameAr, market.nameEn)}</p>
                  <p className="ltr-value text-xs text-muted-foreground">{market.currencyCode}</p>
                </div>
                <p className="text-sm tabular-nums">{t("pricedSkus", { count: market.pricedVariants })}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("catalogHealth")}</CardTitle>
            <CardDescription>{t("catalogHealthHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {healthIssues.length === 0 ? (
              <Alert variant="success">
                <CheckCircle2 /> {t("allGood")}
              </Alert>
            ) : (
              healthIssues.map((issue) => (
                <div key={issue.key} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
                    {issue.label}
                  </span>
                  <span className="font-semibold tabular-nums">{issue.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {data.recentActivity ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ul className="divide-y">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <code className="ltr-value rounded bg-muted px-1.5 py-0.5 text-xs">{entry.action}</code>
                      <span className="truncate text-muted-foreground">{entry.summary}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.actorName ?? "—"} · {format.relativeTime(entry.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Alert variant="info">
        <Info /> {t("modulesNotice")}
      </Alert>
    </div>
  );
}
