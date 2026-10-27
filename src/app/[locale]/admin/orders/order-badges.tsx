import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/primitives";

const STATUS_VARIANT = {
  PENDING_REVIEW: "warning",
  CONFIRMED: "success",
  CANCELLED: "muted",
} as const;

export async function OrderStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("orderStatus");
  const variant = STATUS_VARIANT[status as keyof typeof STATUS_VARIANT] ?? "outline";
  return (
    <Badge variant={variant} data-testid="order-status">
      {t(status as keyof typeof STATUS_VARIANT)}
    </Badge>
  );
}

export async function PaymentStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("paymentStatus");
  return (
    <Badge variant="outline" data-testid="payment-status">
      {t(status as "UNPAID")}
    </Badge>
  );
}
