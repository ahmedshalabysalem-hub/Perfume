import "dotenv/config";

/**
 * Resolve the integration-test database URL and refuse anything that could
 * be a real database: the URL must come from TEST_DATABASE_URL, differ from
 * DATABASE_URL, and name a database containing "test".
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Integration tests need a dedicated, disposable database (see .env.example).");
  }
  const appUrl = process.env.DATABASE_URL_ORIGINAL ?? process.env.DATABASE_URL;
  if (appUrl && appUrl === url && !process.env.CI_ALLOW_SHARED_TEST_DB) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL — the tests wipe the database.");
  }
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to run integration tests against "${databaseName}": the database name must contain "test".`);
  }
  return url;
}
