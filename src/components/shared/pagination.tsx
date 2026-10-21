import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Result count plus previous/next links that keep the current filters. */
export async function Pagination({
  pathname,
  page,
  pageCount,
  params,
  total,
}: {
  pathname: string;
  page: number;
  pageCount: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const t = await getTranslations("common");
  const href = (target: number) => ({
    pathname,
    query: Object.fromEntries(
      Object.entries({ ...params, page: String(target) }).filter((entry): entry is [string, string] => !!entry[1]),
    ),
  });
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{t("resultsCount", { count: total })}</span>
      {pageCount > 1 ? (
        <nav className="flex items-center gap-2" aria-label={t("pageOf", { page, pages: pageCount })}>
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })} rel="prev">
              <ChevronLeft className="rtl:rotate-180" aria-hidden="true" /> {t("previous")}
            </Link>
          ) : null}
          <span>{t("pageOf", { page, pages: pageCount })}</span>
          {page < pageCount ? (
            <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })} rel="next">
              {t("next")} <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
