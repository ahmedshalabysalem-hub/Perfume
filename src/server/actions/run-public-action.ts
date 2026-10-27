import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getRequestMeta, type ServiceContext } from "@/server/context";
import type { ActionResult } from "./result";
import { toActionError } from "./run-action";

/**
 * Run a storefront Server Action that needs no sign-in (cart pricing, guest
 * checkout). The actor is a fixed system label so audit entries show where
 * the change came from; request metadata (client IP) feeds rate limiting.
 * Errors are mapped exactly like `runAction`. Next.js rejects Server Action
 * requests whose Origin does not match the host, which is the CSRF defence.
 */
export async function runPublicAction<T>(
  label: string,
  body: (ctx: ServiceContext) => Promise<T>,
): Promise<ActionResult<T>> {
  let correlationId: string | undefined;
  try {
    const meta = await getRequestMeta();
    correlationId = meta.correlationId;
    const data = await body({ actor: { kind: "system", label }, meta });
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toActionError(error, correlationId) };
  }
}
