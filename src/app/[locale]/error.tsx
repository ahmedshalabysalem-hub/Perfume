"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => {
    // The digest links this message to the server log entry without exposing details.
    console.error("Unhandled UI error", error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl">{t("unexpected")}</h1>
        <p className="mt-3 text-muted-foreground">{t("unexpectedHint")}</p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground ltr-value">{error.digest}</p> : null}
        <Button className="mt-8" variant="outline" onClick={() => reset()}>
          {t("tryAgain")}
        </Button>
      </div>
    </main>
  );
}
