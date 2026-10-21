"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import { NotFoundError } from "@/server/errors";
import {
  createLegalEntity,
  createStore,
  createWarehouse,
  setLegalEntityActive,
  setStoreActive,
  setWarehouseActive,
  updateCountry,
  updateLegalEntity,
  updateStore,
  updateWarehouse,
} from "@/server/modules/organization/organization.service";
import { parseId } from "@/server/validation";

function parseCountryCode(code: unknown): string {
  if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) throw new NotFoundError("country");
  return code;
}

function done<T>(value: T): T {
  refresh();
  return value;
}

export async function updateCountryAction(code: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => done(await updateCountry(ctx, parseCountryCode(code), input).then(() => null)));
}

export async function createLegalEntityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => done(await createLegalEntity(ctx, input)));
}

export async function updateLegalEntityAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => done(await updateLegalEntity(ctx, parseId(id, "legal_entity"), input).then(() => null)));
}

export async function setLegalEntityActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) => done(await setLegalEntityActive(ctx, parseId(id, "legal_entity"), { isActive }).then(() => null)));
}

export async function createStoreAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => done(await createStore(ctx, input)));
}

export async function updateStoreAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => done(await updateStore(ctx, parseId(id, "store"), input).then(() => null)));
}

export async function setStoreActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) => done(await setStoreActive(ctx, parseId(id, "store"), { isActive }).then(() => null)));
}

export async function createWarehouseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => done(await createWarehouse(ctx, input)));
}

export async function updateWarehouseAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => done(await updateWarehouse(ctx, parseId(id, "warehouse"), input).then(() => null)));
}

export async function setWarehouseActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async (ctx) => done(await setWarehouseActive(ctx, parseId(id, "warehouse"), { isActive }).then(() => null)));
}
