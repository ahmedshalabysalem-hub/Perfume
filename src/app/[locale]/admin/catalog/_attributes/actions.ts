"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import { NotFoundError } from "@/server/errors";
import {
  createAttribute,
  setAttributeActive,
  updateAttribute,
  type AttributeKind,
} from "@/server/modules/catalog/attributes.service";
import { parseId } from "@/server/validation";

const KINDS: readonly AttributeKind[] = ["note", "family", "concentration"];

function parseKind(kind: unknown): AttributeKind {
  if (typeof kind !== "string" || !KINDS.includes(kind as AttributeKind)) throw new NotFoundError("attribute");
  return kind as AttributeKind;
}

export async function createAttributeAction(
  kind: AttributeKind,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await createAttribute(ctx, parseKind(kind), input);
    refresh();
    return result;
  });
}

export async function updateAttributeAction(kind: AttributeKind, id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateAttribute(ctx, parseKind(kind), parseId(id, "attribute"), input);
    refresh();
    return null;
  });
}

export async function setAttributeActiveAction(
  kind: AttributeKind,
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await setAttributeActive(ctx, parseKind(kind), parseId(id, "attribute"), { isActive });
    refresh();
    return null;
  });
}
