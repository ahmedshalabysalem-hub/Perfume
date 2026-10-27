import { requiredText, uuid } from "@/lib/schemas/fields";
import { vmsg, z } from "@/lib/validation/zod";

/** Back-office order administration (ORD-001 minimum; the full lifecycle is ORD-002). */

export const ORDER_STATUSES = ["PENDING_REVIEW", "CONFIRMED", "CANCELLED"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const orderListQuerySchema = z.object({
  /** Order number, phone digits or customer name. */
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type OrderListQuery = z.output<typeof orderListQuerySchema>;

const orderAction = {
  orderId: uuid(),
  /** Version of the order the user saw; a stale version is a conflict. */
  version: z.coerce.number().int().min(1),
};

/** Confirm a reviewed order and fix its shipping fee (decimal string in the order currency; 0 = free). */
export const confirmOrderSchema = z.object({
  ...orderAction,
  shippingFee: z
    .string()
    .trim()
    .min(1, { error: vmsg("required") }),
});

export const cancelOrderSchema = z.object({
  ...orderAction,
  reason: requiredText(500),
});

export type ConfirmOrderInput = z.input<typeof confirmOrderSchema>;
export type CancelOrderInput = z.input<typeof cancelOrderSchema>;
