import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };
export type FilterDefinition = { name: string; label: string; options: FilterOption[]; value?: string };

/**
 * Search + filters as a plain GET form: works without JavaScript, produces
 * shareable URLs, and lets barcode scanners "type" into the search box.
 */
export async function ListToolbar({
  pathname,
  query,
  searchPlaceholder,
  filters = [],
  sort,
  autoFocusSearch,
}: {
  pathname: string;
  query?: string;
  searchPlaceholder: string;
  filters?: FilterDefinition[];
  sort?: FilterDefinition;
  autoFocusSearch?: boolean;
}) {
  const t = await getTranslations("common");
  const hasActive = !!query || filters.some((filter) => filter.value);
  const selects = [...filters, ...(sort ? [sort] : [])];
  return (
    <form method="get" role="search" className="mb-4 grid gap-3 rounded-xl border bg-card p-3">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t("search")}</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={searchPlaceholder}
            className="ps-9"
            autoFocus={autoFocusSearch}
            autoComplete="off"
            data-testid="list-search"
          />
        </label>
        <button type="submit" className={buttonVariants({ variant: "default" })}>
          {t("apply")}
        </button>
        {hasActive ? (
          <Link href={pathname} className={buttonVariants({ variant: "ghost" })}>
            {t("reset")}
          </Link>
        ) : null}
      </div>
      {selects.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {selects.map((filter) => (
            <label key={filter.name} className="grid gap-1 text-xs font-medium text-muted-foreground">
              {filter.label}
              <NativeSelect name={filter.name} defaultValue={filter.value ?? ""} className="text-foreground">
                {filter === sort ? null : <option value="">{t("all")}</option>}
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
        </div>
      ) : null}
    </form>
  );
}

export { Pagination } from "@/components/shared/pagination";

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>{children}</div>;
}
