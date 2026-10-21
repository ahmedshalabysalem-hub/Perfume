"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import { createBrand, setBrandActive, updateBrand } from "@/server/modules/catalog/brands.service";
import { parseId } from "@/server/validation";

// Thin adapters: authorisation and validation live in the service.

export async function createBrandAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await createBrand(ctx, input);
    refresh();
    return result;
  });
}

export async function updateBrandAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateBrand(ctx, parseId(id, "brand"), input);
    refresh();
    return null;
  });
}

export async function setBrandActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await setBrandActive(ctx, parseId(id, "brand"), { isActive });
    refresh();
    return null;
  });
}
