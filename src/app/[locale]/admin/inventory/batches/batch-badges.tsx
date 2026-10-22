import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/primitives";
import type { BatchInspectionStatusValue, ExpiryState } from "@/lib/inventory/batches";

const INSPECTION_VARIANTS = {
  PENDING_INSPECTION: "secondary",
  RELEASED: "success",
  QUARANTINED: "warning",
  REJECTED: "destructive",
} as const;

export function InspectionBadge({ status }: { status: BatchInspectionStatusValue }) {
  const t = useTranslations("batches.inspection");
  return (
    <Badge variant={INSPECTION_VARIANTS[status]} data-inspection-status={status}>
      {t(status)}
    </Badge>
  );
}

/** Sale eligibility: the derived answer, never stored (ADR-023). */
export function EligibilityBadge({
  eligibility,
}: {
  eligibility: { eligible: true } | { eligible: false; reason: "NOT_RELEASED" | "EXPIRED" | "EXPIRY_UNVERIFIED" };
}) {
  const t = useTranslations("batches");
  return eligibility.eligible ? (
    <Badge variant="success" data-eligible="true">
      {t("eligible")}
    </Badge>
  ) : (
    <Badge variant="outline" data-eligible="false" data-reason={eligibility.reason}>
      {t(`ineligible.${eligibility.reason}`)}
    </Badge>
  );
}

/** A lot number, or the LEGACY marker for stock carried over without one. */
export function LotLabel({ lotNumber, isLegacy }: { lotNumber: string | null; isLegacy: boolean }) {
  const t = useTranslations("batches");
  return (
    <span className="inline-flex items-center gap-1">
      {lotNumber ? <span className="ltr-value font-mono text-xs">{lotNumber}</span> : null}
      {isLegacy ? <Badge variant="outline">{t("legacy")}</Badge> : null}
    </span>
  );
}

/** Expiry as the label gives it: a day, a month (stored as its last day), unknown or not tracked. */
export function ExpiryText({
  expiresOn,
  precision,
  state,
}: {
  expiresOn: string | null;
  precision: "DAY" | "MONTH" | null;
  state: ExpiryState;
}) {
  const t = useTranslations("batches.expiry");
  const format = useFormatter();
  if (state === "UNKNOWN") return <span className="text-muted-foreground">{t("unknown")}</span>;
  if (state === "NOT_TRACKED" || !expiresOn) return <span className="text-muted-foreground">{t("notTracked")}</span>;
  const date = new Date(`${expiresOn}T00:00:00Z`);
  const text =
    precision === "MONTH"
      ? format.dateTime(date, { year: "numeric", month: "long", timeZone: "UTC" })
      : format.dateTime(date, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <span className={state === "EXPIRED" ? "font-medium text-destructive" : undefined} data-expiry-state={state}>
      {text}
      {state === "EXPIRED" ? ` · ${t("expired")}` : null}
    </span>
  );
}
