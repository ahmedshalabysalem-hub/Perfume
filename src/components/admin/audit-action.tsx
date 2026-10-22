import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type LooseTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

/**
 * An audit action as a translated label with its stored code beside it. The
 * code (`catalog.product.update`) is the record's real value and stays as is;
 * actions without a label yet show the code alone.
 */
export async function AuditAction({ action, className }: { action: string; className?: string }) {
  const t = (await getTranslations("auditActions")) as unknown as LooseTranslator;
  const label = t.has(action) ? t(action) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {label ? <span className="font-medium">{label}</span> : null}
      <code className="ltr-value rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{action}</code>
    </span>
  );
}
