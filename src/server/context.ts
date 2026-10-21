import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
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
 * an upstream load balancer). The client IP comes from X-Forwarded-For, so the
 * reverse proxy in front of the app must overwrite that header; it is used for
 * audit and rate limiting, never for authorisation decisions.
 */
export const getRequestMeta = cache(async (): Promise<RequestMeta> => {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : requestHeaders.get("x-real-ip");
  return {
    correlationId: requestHeaders.get(CORRELATION_HEADER) ?? crypto.randomUUID(),
    ipAddress: ip ? ip.slice(0, 64) : null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
  };
});

export function systemContext(label: string): ServiceContext {
  return {
    actor: { kind: "system", label },
    meta: { correlationId: `system:${label}:${crypto.randomUUID()}`, ipAddress: null, userAgent: null },
  };
}
