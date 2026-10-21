import { afterAll } from "vitest";
import { testDatabaseUrl } from "./test-database";

// Point the application's lazy Prisma client at the test database before any
// test module touches it.
process.env.DATABASE_URL_ORIGINAL ??= process.env.DATABASE_URL;
process.env.DATABASE_URL = testDatabaseUrl();
process.env.STORAGE_LOCAL_DIR ??= "./storage/test-uploads";
process.env.APP_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "integration-tests-only-secret-0123456789abcdef";

afterAll(async () => {
  const { db } = await import("@/server/db");
  await db.$disconnect();
});
