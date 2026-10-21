import "server-only";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { assertCan } from "@/server/rbac/authorize";

export type HistoryEntry = {
  id: string;
  occurredAt: Date;
  action: string;
  summary: string | null;
  reason: string | null;
  actorName: string | null;
  before: unknown;
  after: unknown;
};

/**
 * Change history of a product and its variants, for catalogue users. Unlike
 * the full audit log (audit.view) this omits IP addresses and user agents.
 */
export async function getProductHistory(
  ctx: ServiceContext,
  productId: string,
  variantIds: string[],
): Promise<HistoryEntry[]> {
  assertCan(ctx.actor, "products.view");
  const entries = await db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "product", entityId: productId },
        ...(variantIds.length > 0 ? [{ entityType: "product_variant", entityId: { in: variantIds } }] : []),
      ],
    },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
  const actorIds = [...new Set(entries.map((entry) => entry.actorUserId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  return entries.map((entry) => ({
    id: entry.id,
    occurredAt: entry.occurredAt,
    action: entry.action,
    summary: entry.summary,
    reason: entry.reason,
    actorName: entry.actorUserId ? (names.get(entry.actorUserId) ?? null) : null,
    before: entry.before,
    after: entry.after,
  }));
}
