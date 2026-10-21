import "server-only";
import type { DbClient } from "@/server/db";
import type { ServiceContext } from "@/server/context";
import { redactForAudit } from "./redact";

export type AuditInput = {
  /** Dotted action name, e.g. "catalog.product.create". */
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/**
 * Append an audit entry. Pass the transaction client of the business operation
 * so the entry commits — or rolls back — together with the change it records.
 */
export async function recordAudit(
  client: DbClient,
  ctx: ServiceContext,
  input: AuditInput,
): Promise<void> {
  const actor = ctx.actor;
  await client.auditLog.create({
    data: {
      actorType: actor.kind === "system" ? "SYSTEM" : "USER",
      actorUserId: actor.kind === "user" ? actor.userId : null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary?.slice(0, 300) ?? (actor.kind === "system" ? actor.label : null),
      before: input.before === undefined ? undefined : (redactForAudit(input.before) ?? undefined),
      after: input.after === undefined ? undefined : (redactForAudit(input.after) ?? undefined),
      reason: input.reason?.slice(0, 500) ?? null,
      correlationId: ctx.meta.correlationId.slice(0, 64),
      ipAddress: ctx.meta.ipAddress,
      userAgent: ctx.meta.userAgent,
    },
  });
}
