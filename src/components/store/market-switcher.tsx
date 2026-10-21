"use client";

import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setMarketAction } from "@/app/[locale]/(store)/actions";

export function MarketSwitcher({
  current,
  markets,
}: {
  current: string;
  markets: Array<{ code: string; label: string }>;
}) {
  const t = useTranslations("store");
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <MapPin className="size-4 text-gold" aria-hidden="true" />
      <span className="sr-only">{t("chooseMarket")}</span>
      <select
        value={current}
        disabled={pending}
        data-testid="market-switcher"
        onChange={(event) => {
          const code = event.target.value;
          // setMarketAction sets a cookie, which makes Next.js re-render the page.
          startTransition(() => setMarketAction(code));
        }}
        className="cursor-pointer bg-transparent pe-1 font-medium outline-none"
      >
        {markets.map((market) => (
          <option key={market.code} value={market.code}>
            {market.label}
          </option>
        ))}
      </select>
    </label>
  );
}
