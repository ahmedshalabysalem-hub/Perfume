import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { clientAddress } from "@/lib/client-ip";
import { env } from "@/lib/env";
import type { Actor } from "@/server/rbac/actor";

/** Request metadata recorded with audit entries. */
export type RequestMeta = {
  correlationId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

/** Everything a service needs to authorise and audit an operation. */
export type ServiceContext = {
  actor: Actor;
  meta: RequestMeta;
};

export const CORRELATION_HEADER = "x-request-id";

/**
 * Per-request metadata. The correlation id is assigned by `src/proxy.ts` (or
 * an upstream load balancer). The client IP is read from X-Forwarded-For at
 * the hop of the outermost trusted proxy (`TRUSTED_PROXY_HOPS`), never from
 * the client-controlled entries left of it; with no trusted proxy it is
 * unknown (null). It is used for audit and rate limiting, never for
 * authorisation decisions.
 */
export const getRequestMeta = cache(async (): Promise<RequestMeta> => {
  const requestHeaders = await headers();
  const ip = clientAddress(requestHeaders.get("x-forwarded-for"), env().TRUSTED_PROXY_HOPS);
  return {
    correlationId: requestHeaders.get(CORRELATION_HEADER) ?? crypto.randomUUID(),
    ipAddress: ip,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
  };
});

export function systemContext(label: string): ServiceContext {
  return {
    actor: { kind: "system", label },
    meta: { correlationId: `system:${label}:${crypto.randomUUID()}`, ipAddress: null, userAgent: null },
  };
}
