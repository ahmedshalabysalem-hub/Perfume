"use client";

import { LanguagesIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Switches between Arabic and English while keeping the current page and query. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const target = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      lang={target}
      disabled={pending}
      aria-label={t("language")}
      data-testid="locale-switcher"
      onClick={() => {
        const query = Object.fromEntries(searchParams.entries());
        startTransition(() => router.replace({ pathname, query }, { locale: target }));
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60",
        className,
      )}
    >
      <LanguagesIcon className="size-4" aria-hidden="true" />
      {target === "ar" ? t("arabic") : t("english")}
    </button>
  );
}
