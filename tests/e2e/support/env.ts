import "dotenv/config";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * Password the seed gives every account in the disposable e2e database. It
 * only ever exists in that throw-away database; override with E2E_PASSWORD.
 */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Throwaway-Pass-2026";

export const USERS = {
  admin: "admin@perfume.local",
  catalog: "catalog@perfume.local",
  managerSa: "manager.sa@perfume.local",
  procurementSa: "procurement.sa@perfume.local",
  cashier: "cashier.riyadh@perfume.local",
} as const;

/**
 * The e2e database is emptied and re-seeded on every run. Use E2E_DATABASE_URL,
 * or derive "<name>_e2e" from TEST_DATABASE_URL; refuse names that do not look
 * disposable and never touch DATABASE_URL.
 */
export function e2eDatabaseUrl(): string {
  let url = process.env.E2E_DATABASE_URL;
  if (!url && process.env.TEST_DATABASE_URL) {
    const derived = new URL(process.env.TEST_DATABASE_URL);
    derived.pathname = `${derived.pathname.replace(/_?test$/i, "")}_e2e`;
    url = derived.toString();
  }
  if (!url) {
    throw new Error("Set E2E_DATABASE_URL (or TEST_DATABASE_URL) to a disposable PostgreSQL database.");
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("E2E_DATABASE_URL must not equal DATABASE_URL — the e2e run wipes the database.");
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/e2e|test/i.test(name)) {
    throw new Error(`Refusing to use "${name}" for e2e tests: the database name must contain "e2e" or "test".`);
  }
  return url;
}
