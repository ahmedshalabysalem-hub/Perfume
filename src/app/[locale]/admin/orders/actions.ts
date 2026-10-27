"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import { cancelOrder, confirmOrder } from "@/server/modules/orders/orders.service";

// Thin adapters: authorisation and validation live in the service.

export async function confirmOrderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await confirmOrder(ctx, input);
    refresh();
    return { id: result.id };
  });
}

export async function cancelOrderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await cancelOrder(ctx, input);
    refresh();
    return result;
  });
}
