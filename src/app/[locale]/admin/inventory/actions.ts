"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import { postOpeningBalance } from "@/server/modules/inventory/stock.service";

// Thin adapters: authorisation and validation live in the service.

export async function postOpeningBalanceAction(input: unknown): Promise<ActionResult<{ movementId: string }>> {
  return runAction(async (ctx) => {
    const result = await postOpeningBalance(ctx, input);
    refresh();
    return result;
  });
}
