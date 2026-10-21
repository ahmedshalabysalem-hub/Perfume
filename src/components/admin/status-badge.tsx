import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/primitives";

const VARIANTS = {
  PUBLISHED: "success",
  ACTIVE: "success",
  DRAFT: "secondary",
  PENDING: "warning",
  INACTIVE: "muted",
  SUSPENDED: "warning",
  DEACTIVATED: "destructive",
  DISCONTINUED: "destructive",
  EXPIRED: "destructive",
  REJECTED: "destructive",
  NOT_REQUIRED: "muted",
} as const;

export type StatusValue = keyof typeof VARIANTS;

/** Works in both server and client components (useTranslations is isomorphic). */
export function StatusBadge({ status }: { status: StatusValue }) {
  const t = useTranslations("status");
  return (
    <Badge variant={VARIANTS[status]} data-status={status}>
      {t(status)}
    </Badge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations("common");
  return <Badge variant={active ? "success" : "muted"}>{active ? t("active") : t("inactive")}</Badge>;
}
