"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { runAction } from "@/server/actions/run-action";
import type { ActionResult } from "@/server/actions/result";
import { recordAudit } from "@/server/audit/audit";
import { getAuth } from "@/server/auth/auth";
import { checkPasswordPolicy } from "@/server/auth/credentials";
import { getCurrentActor } from "@/server/auth/session";
import { getRequestMeta } from "@/server/context";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { parseInput } from "@/server/validation";
import { changePasswordSchema } from "@/lib/schemas/access";

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const data = parseInput(changePasswordSchema, input);
    const actor = ctx.actor.kind === "user" ? ctx.actor : null;
    if (!actor) throw new ValidationError({});

    const policyProblems = checkPasswordPolicy(data.newPassword, { email: actor.email, name: actor.name });
    if (policyProblems.length > 0) throw new ValidationError({ newPassword: policyProblems });

    try {
      await getAuth().api.changePassword({
        body: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          revokeOtherSessions: true,
        },
        headers: await headers(),
      });
    } catch (error) {
      if (isAPIError(error) && (error.status === "BAD_REQUEST" || error.status === "UNAUTHORIZED")) {
        throw new ValidationError({ currentPassword: ["auth.wrongCurrentPassword"] });
      }
      throw error;
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { mustChangePassword: false } });
      await recordAudit(tx, ctx, {
        action: "auth.password.change",
        entityType: "user",
        entityId: actor.userId,
        summary: "Changed own password (other sessions revoked)",
      });
    });
    return null;
  });
}

/** Sign out (form action). Records the event, revokes the session, then the client navigates. */
export async function signOutAction(): Promise<void> {
  const actor = await getCurrentActor();
  if (actor) {
    const meta = await getRequestMeta();
    await recordAudit(db, { actor, meta }, { action: "auth.logout", entityType: "user", entityId: actor.userId });
  }
  await getAuth().api.signOut({ headers: await headers() });
}
