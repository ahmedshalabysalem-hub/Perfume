"use server";

import { getCurrentActor } from "@/server/auth/session";
import { getRequestMeta } from "@/server/context";
import { setOwnPreferredLocale } from "@/server/modules/access/preferences.service";

/**
 * Called by the language switcher. Visitors keep their choice in the
 * NEXT_LOCALE cookie only (set by the locale middleware); for a signed-in user
 * it is also saved on the account. Failures never block the switch itself.
 */
export async function savePreferredLocaleAction(locale: unknown): Promise<void> {
  const actor = await getCurrentActor();
  if (!actor) return;
  try {
    await setOwnPreferredLocale({ actor, meta: await getRequestMeta() }, { locale });
  } catch (error) {
    console.error("[locale] could not save the preferred language", error instanceof Error ? error.name : error);
  }
}
