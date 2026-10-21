import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getRequestMeta, type ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { actorUserSelect, buildActor, type UserActor } from "@/server/rbac/actor";
import { getAuth } from "./auth";

/** The Better Auth session for this request (validated against the database). */
export const getSession = cache(async () => {
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

/** Load an actor (user + resolved grants) fresh from the database. */
export async function loadActor(userId: string): Promise<UserActor | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: actorUserSelect });
  return row ? buildActor(row) : null;
}

/**
 * The signed-in, ACTIVE user for this request, or null. Status and role
 * assignments are read from the database on every request, so deactivation
 * and permission changes apply immediately.
 */
export const getCurrentActor = cache(async (): Promise<UserActor | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadActor(session.user.id);
});

/** Service context for Server Actions / Route Handlers. Throws when signed out. */
export async function requireServiceContext(): Promise<ServiceContext> {
  const actor = await getCurrentActor();
  if (!actor) throw new UnauthenticatedError();
  return { actor, meta: await getRequestMeta() };
}
