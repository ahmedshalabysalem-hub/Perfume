import "server-only";
import { preferredLocaleSchema } from "@/lib/schemas/access";
import { recordAudit } from "@/server/audit/audit";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { parseInput } from "@/server/validation";

/**
 * Save the signed-in user's own UI language (`users.preferred_locale`). A
 * personal preference: no permission is needed beyond being signed in, and it
 * never touches market, currency, legal entity or warehouse.
 */
export async function setOwnPreferredLocale(ctx: ServiceContext, input: unknown): Promise<void> {
  const { locale } = parseInput(preferredLocaleSchema, input);
  if (ctx.actor.kind !== "user") throw new UnauthenticatedError();
  const userId = ctx.actor.userId;

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: userId }, select: { preferredLocale: true } });
    if (!existing) throw new UnauthenticatedError();
    if (existing.preferredLocale === locale) return;
    await tx.user.update({ where: { id: userId }, data: { preferredLocale: locale } });
    await recordAudit(tx, ctx, {
      action: "users.preferences.update",
      entityType: "user",
      entityId: userId,
      before: { preferredLocale: existing.preferredLocale },
      after: { preferredLocale: locale },
    });
  });
}

/** The user's saved UI language, or null when none is saved or it is not a supported locale. */
export async function getPreferredLocale(userId: string): Promise<"ar" | "en" | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { preferredLocale: true } });
  return row?.preferredLocale === "ar" || row?.preferredLocale === "en" ? row.preferredLocale : null;
}
