import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

/**
 * Fixed-window request counters kept in PostgreSQL, so every app instance
 * shares them (public storefront endpoints: cart pricing, checkout). One
 * atomic upsert per call; no personal data is stored beyond the key the caller
 * chooses (an IP address, hashed by the caller when that matters).
 */

export class RateLimitedError extends AppError {
  constructor() {
    super("RATE_LIMITED", "errors.rateLimited");
  }
}

export type ThrottleRule = { name: string; limit: number; windowSeconds: number };

/** Count one hit for `subject` under `rule`; throws RateLimitedError past the limit. */
export async function consumeThrottle(rule: ThrottleRule, subject: string): Promise<void> {
  const key = `${rule.name}:${subject}`.slice(0, 200);
  const rows = await db.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "request_throttles" ("key", "window_start", "hits")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "request_throttles"."window_start" <= now() - make_interval(secs => ${rule.windowSeconds})
                    THEN 1 ELSE "request_throttles"."hits" + 1 END,
      "window_start" = CASE WHEN "request_throttles"."window_start" <= now() - make_interval(secs => ${rule.windowSeconds})
                    THEN now() ELSE "request_throttles"."window_start" END
    RETURNING "hits"`;
  if ((rows[0]?.hits ?? 0) > rule.limit) throw new RateLimitedError();
}

/** Remove counters whose window ended long ago (called opportunistically). */
export async function pruneThrottles(olderThanSeconds = 86_400): Promise<void> {
  await db.$executeRaw`DELETE FROM "request_throttles" WHERE "window_start" < now() - make_interval(secs => ${olderThanSeconds})`;
}
