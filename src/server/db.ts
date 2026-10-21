import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export { Prisma } from "@/generated/prisma/client";
export type { PrismaClient } from "@/generated/prisma/client";

/** Interactive-transaction client type, for services that run inside `db.$transaction`. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
/** Either the root client or a transaction client. */
export type DbClient = PrismaClient | Tx;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  }
  const adapter = new PrismaPg({
    connectionString,
    // node-postgres has no connect timeout by default; fail fast instead of hanging.
    connectionTimeoutMillis: 10_000,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Reuse one client (and one connection pool) per process, including across
// hot reloads in development.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createClient();
  }
  return globalForPrisma.__prisma;
}

/**
 * Lazily-initialised Prisma client. Importing this module never opens a
 * connection, which keeps `next build` independent of the database.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
