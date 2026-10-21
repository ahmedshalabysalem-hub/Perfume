import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

/**
 * Bring the test database schema up to date once per run. `migrate deploy`
 * is non-destructive (it only applies pending migrations); each test file
 * then truncates the tables it needs via fixtures.resetDatabase().
 *
 * If a committed migration is ever edited, deploy fails on the checksum —
 * drop and recreate the test database manually in that case.
 */
export default function setup() {
  const url = testDatabaseUrl();
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed for the test database:\n${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`,
    );
  }
}
