"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import {
  changeBatchStatus,
  correctBatchDetails,
  verifyBatch,
  type BatchActionResult,
} from "@/server/modules/inventory/batches.service";
import { postOpeningBalance } from "@/server/modules/inventory/stock.service";

// Thin adapters: authorisation and validation live in the service.

export async function postOpeningBalanceAction(input: unknown): Promise<ActionResult<{ movementId: string }>> {
  return runAction(async (ctx) => {
    const result = await postOpeningBalance(ctx, input);
    refresh();
    return result;
  });
}

export async function verifyBatchAction(input: unknown): Promise<ActionResult<BatchActionResult>> {
  return runAction(async (ctx) => {
    const result = await verifyBatch(ctx, input);
    refresh();
    return result;
  });
}

export async function changeBatchStatusAction(input: unknown): Promise<ActionResult<BatchActionResult>> {
  return runAction(async (ctx) => {
    const result = await changeBatchStatus(ctx, input);
    refresh();
    return result;
  });
}

export async function correctBatchDetailsAction(input: unknown): Promise<ActionResult<BatchActionResult>> {
  return runAction(async (ctx) => {
    const result = await correctBatchDetails(ctx, input);
    refresh();
    return result;
  });
}
