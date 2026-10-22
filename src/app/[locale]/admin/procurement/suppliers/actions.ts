"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import {
  addSupplierContact,
  addSupplierProduct,
  createSupplier,
  removeSupplierContact,
  setSupplierActive,
  setSupplierProductActive,
  updateSupplier,
  updateSupplierContact,
  updateSupplierProduct,
} from "@/server/modules/procurement/suppliers.service";
import { parseId } from "@/server/validation";

function done<T>(value: T): T {
  refresh();
  return value;
}

// Suppliers --------------------------------------------------------------------

export async function createSupplierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction((ctx) => createSupplier(ctx, input));
}

export async function updateSupplierAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => done(await updateSupplier(ctx, parseId(id, "supplier"), input).then(() => null)));
}

export async function setSupplierActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) =>
    done(await setSupplierActive(ctx, parseId(id, "supplier"), { isActive }).then(() => null)),
  );
}

// Contacts ---------------------------------------------------------------------

export async function addSupplierContactAction(
  supplierId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => done(await addSupplierContact(ctx, parseId(supplierId, "supplier"), input)));
}

export async function updateSupplierContactAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) =>
    done(await updateSupplierContact(ctx, parseId(id, "supplier_contact"), input).then(() => null)),
  );
}

export async function removeSupplierContactAction(id: string): Promise<ActionResult> {
  return runAction(async (ctx) =>
    done(await removeSupplierContact(ctx, parseId(id, "supplier_contact")).then(() => null)),
  );
}

// Supplier products ------------------------------------------------------------

export async function addSupplierProductAction(
  supplierId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => done(await addSupplierProduct(ctx, parseId(supplierId, "supplier"), input)));
}

export async function updateSupplierProductAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) =>
    done(await updateSupplierProduct(ctx, parseId(id, "supplier_product"), input).then(() => null)),
  );
}

export async function setSupplierProductActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) =>
    done(await setSupplierProductActive(ctx, parseId(id, "supplier_product"), { isActive }).then(() => null)),
  );
}
