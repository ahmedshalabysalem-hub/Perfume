import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Readiness probe for load balancers and uptime monitors: 200 when the app
 * can reach PostgreSQL, 503 otherwise. Exposes no version or configuration.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers });
  } catch (error) {
    console.error("[health] database check failed:", error instanceof Error ? error.message : error);
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
