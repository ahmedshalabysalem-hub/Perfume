"use client";

import { LanguagesIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { savePreferredLocaleAction } from "@/app/[locale]/actions";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// Forms the user has typed into since they were mounted, submitted or reset.
// Switching language re-renders the whole document, so their values would be
// lost; the switcher asks first. GET forms (search and filters) are excluded.
const editedForms = new WeakSet<HTMLFormElement>();
let trackingInstalled = false;

function trackEditedForms() {
  if (trackingInstalled) return;
  trackingInstalled = true;
  const mark = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const form = event.target.closest("form");
    // `form.method` reports "get" when the attribute is missing, so read the attribute.
    if (form && form.getAttribute("method")?.toLowerCase() !== "get") editedForms.add(form);
  };
  const clear = (event: Event) => {
    if (event.target instanceof HTMLFormElement) editedForms.delete(event.target);
  };
  document.addEventListener("input", mark, true);
  document.addEventListener("change", mark, true);
  document.addEventListener("submit", clear, true);
  document.addEventListener("reset", clear, true);
}

function hasUnsavedForm(): boolean {
  return [...document.forms].some((form) => editedForms.has(form));
}

const LABEL_KEYS = { ar: "arabic", en: "english" } as const satisfies Record<Locale, string>;

/**
 * Arabic / English switch for every shared layout. Keeps the current page and
 * query, remembers the choice (cookie for everyone, account for signed-in
 * users) and never touches market, currency or company.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(trackEditedForms, []);

  function switchTo(target: Locale) {
    if (target === locale) return;
    if (hasUnsavedForm() && !window.confirm(t("unsavedChangesSwitch"))) return;
    const query = Object.fromEntries(searchParams.entries());
    startTransition(async () => {
      await savePreferredLocaleAction(target);
      router.replace({ pathname, query }, { locale: target });
    });
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      data-testid="locale-switcher"
      className={cn("inline-flex items-center gap-0.5 rounded-md border p-0.5 text-sm", className)}
    >
      <LanguagesIcon className="mx-1 hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
      {routing.locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === locale}
          disabled={pending}
          data-testid={`locale-${option}`}
          onClick={() => switchTo(option)}
          className={cn(
            "rounded px-2 py-1 font-medium transition-colors disabled:opacity-60",
            option === locale ? "bg-foreground text-background" : "hover:bg-accent",
          )}
        >
          {t(LABEL_KEYS[option])}
        </button>
      ))}
    </div>
  );
}
