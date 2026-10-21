"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import { createCategory, setCategoryActive, updateCategory } from "@/server/modules/catalog/categories.service";
import { parseId } from "@/server/validation";

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await createCategory(ctx, input);
    refresh();
    return result;
  });
}

export async function updateCategoryAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateCategory(ctx, parseId(id, "category"), input);
    refresh();
    return null;
  });
}

export async function setCategoryActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await setCategoryActive(ctx, parseId(id, "category"), { isActive });
    refresh();
    return null;
  });
}
