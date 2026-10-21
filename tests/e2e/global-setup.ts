import { execSync } from "node:child_process";
import pg from "pg";
import { E2E_PASSWORD, USERS, e2eDatabaseUrl } from "./support/env";

/** Create the e2e database if it does not exist yet (needs CREATEDB). */
async function ensureDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.replace(/^\//, "");
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

/** Empty every application table (the audit log needs the retention-purge switch). */
async function emptyDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length === 0) return;
    await client.query("BEGIN");
    await client.query("SET LOCAL app.audit_retention_purge = 'on'");
    await client.query(`TRUNCATE TABLE ${rows.map((row) => `"${row.tablename}"`).join(", ")} CASCADE`);
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

function run(command: string, env: NodeJS.ProcessEnv): void {
  try {
    execSync(command, { stdio: "pipe", env });
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`${command} failed:\n${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`);
  }
}

/**
 * Fresh, seeded database for every run: migrate (non-destructive), empty the
 * tables, then run the development seed with a throw-away password.
 */
export default async function globalSetup(): Promise<void> {
  const url = e2eDatabaseUrl();
  await ensureDatabase(url);
  const env = { ...process.env, DATABASE_URL: url };
  run("npx prisma migrate deploy", env);
  await emptyDatabase(url);
  run("npx tsx prisma/seed.ts", {
    ...env,
    NODE_ENV: "development",
    SEED_ADMIN_EMAIL: USERS.admin,
    SEED_ADMIN_PASSWORD: E2E_PASSWORD,
  });
}
