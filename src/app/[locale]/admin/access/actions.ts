"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/server/actions/result";
import { runAction } from "@/server/actions/run-action";
import {
  assignRole,
  createStaffUser,
  resetStaffPassword,
  revokeRoleAssignment,
  setStaffUserStatus,
  updateStaffUser,
} from "@/server/modules/access/users.service";
import { parseId } from "@/server/validation";

export async function createStaffUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction((ctx) => createStaffUser(ctx, input));
}

export async function updateStaffUserAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateStaffUser(ctx, parseId(id, "user"), input);
    refresh();
    return null;
  });
}

export async function resetStaffPasswordAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await resetStaffPassword(ctx, parseId(id, "user"), input);
    refresh();
    return null;
  });
}

export async function setStaffUserStatusAction(
  id: string,
  status: string,
  reason: string | null,
): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await setStaffUserStatus(ctx, parseId(id, "user"), { status, reason });
    refresh();
    return null;
  });
}

export async function assignRoleAction(userId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const result = await assignRole(ctx, parseId(userId, "user"), input);
    refresh();
    return result;
  });
}

export async function revokeRoleAssignmentAction(assignmentId: string): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await revokeRoleAssignment(ctx, parseId(assignmentId, "user_role"));
    refresh();
    return null;
  });
}
