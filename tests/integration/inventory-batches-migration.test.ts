import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./test-database";

/**
 * INV-002 migration on a database holding INV-001 stock (AC 5, 14, 23; test
 * plan G4). A scratch database (its name contains "test") gets the migrations
 * before INV-002, the INV-001 fixture data, then the INV-002 migrations, each
 * file applied as one statement batch like `prisma migrate deploy` does.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../../prisma/migrations");
const FIXTURE = path.resolve(import.meta.dirname, "sql/inv-001-ledger-data.sql");
const FIRST_INV_002 = "20261022095900_stock_movement_types_for_batches";
const TRACKED = "00000000-0000-7000-8000-000000000041";
const PLAIN = "00000000-0000-7000-8000-000000000042";

const testUrl = new URL(testDatabaseUrl());
const scratchName = `${testUrl.pathname.replace(/^\//, "")}_inv002_migration`;
const scratchUrl = new URL(testUrl);
scratchUrl.pathname = `/${scratchName}`;
let client: pg.Client;

async function admin(sql: string) {
  const maintenance = new pg.Client({ connectionString: testUrl.toString() });
  await maintenance.connect();
  try {
    await maintenance.query(sql);
  } finally {
    await maintenance.end();
  }
}

function migrations(filter: (name: string) => boolean) {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{14}_/.test(name) && filter(name))
    .sort()
    .map((name) => readFileSync(path.join(MIGRATIONS, name, "migration.sql"), "utf8"));
}

type Totals = Record<string, number>;

async function totals(): Promise<Totals> {
  const { rows } = await client.query<{ key: string; on_hand: string }>(
    `SELECT "variant_id" || '|' || "warehouse_id" || '|' || "status" AS key, SUM("on_hand") AS on_hand
       FROM "stock_balances" GROUP BY 1`,
  );
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.on_hand)]));
}

let before: Totals;
let movementsBefore: unknown[];

beforeAll(async () => {
  if (!/test/i.test(scratchName)) throw new Error("scratch database name must contain 'test'");
  await admin(`DROP DATABASE IF EXISTS "${scratchName}"`);
  await admin(`CREATE DATABASE "${scratchName}"`);
  client = new pg.Client({ connectionString: scratchUrl.toString() });
  await client.connect();
  for (const sql of migrations((name) => name < FIRST_INV_002)) await client.query(sql);
  await client.query(readFileSync(FIXTURE, "utf8"));
  before = await totals();
  movementsBefore = (await client.query(`SELECT * FROM "stock_movements" ORDER BY "id"`)).rows;
  for (const sql of migrations((name) => name >= FIRST_INV_002)) await client.query(sql);
}, 120_000);

afterAll(async () => {
  await client?.end();
  await admin(`DROP DATABASE IF EXISTS "${scratchName}"`);
});

describe("INV-002 migration on INV-001 data", () => {
  it("keeps every quantity per variant, warehouse and status", async () => {
    expect(await totals()).toEqual(before);
  });

  it("leaves every existing movement untouched and adds two BATCH_ASSIGNMENT lines per non-zero balance", async () => {
    const { rows } = await client.query(
      `SELECT * FROM "stock_movements" WHERE "type" <> 'BATCH_ASSIGNMENT' ORDER BY "id"`,
    );
    expect(rows.map(({ batch_id: batchId, ...row }) => ({ ...row, batchIdNull: batchId === null }))).toEqual(
      movementsBefore.map((row) => ({ ...(row as object), batchIdNull: true })),
    );
    const assignments = await client.query<{ quantity: number; batch_id: string | null; idempotency_key: string }>(
      `SELECT "quantity", "batch_id", "idempotency_key" FROM "stock_movements" WHERE "type" = 'BATCH_ASSIGNMENT'`,
    );
    // Tracked: SA-1 SELLABLE 10, SA-1 QUARANTINED 3, SA-2 SELLABLE 5, EG-1 DAMAGED 1 (the zero balance stays).
    expect(assignments.rowCount).toBe(8);
    expect(assignments.rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(0);
    expect(assignments.rows.every((row) => row.idempotency_key.startsWith("migration:inv-002:"))).toBe(true);
  });

  it("creates one LEGACY batch per company, pending, unverified, with unknown expiry and no invented data", async () => {
    const { rows } = await client.query(`SELECT * FROM "stock_batches" ORDER BY "country_code"`);
    expect(rows).toHaveLength(2);
    for (const batch of rows) {
      expect(batch).toMatchObject({
        variant_id: TRACKED,
        is_legacy: true,
        lot_number: null,
        manufactured_on: null,
        expires_on: null,
        expiry_precision: null,
        expiry_basis: "UNKNOWN",
        inspection_status: "PENDING_INSPECTION",
        verification_result: "NONE",
        details_complete: false,
      });
    }
    const balances = await client.query<{
      status: string;
      on_hand: number;
      batch_id: string | null;
      variant_id: string;
    }>(`SELECT "status", "on_hand", "batch_id", "variant_id" FROM "stock_balances" WHERE "on_hand" > 0`);
    for (const balance of balances.rows) {
      expect(balance.batch_id === null).toBe(balance.variant_id === PLAIN);
    }
    const sellable = await client.query<{ ok: boolean }>(
      `SELECT bool_or("stock_batch_is_sellable"("batch_id", "warehouse_id")) AS ok
         FROM "stock_balances" WHERE "batch_id" IS NOT NULL`,
    );
    expect(sellable.rows[0]?.ok).toBe(false);
    const audits = await client.query(`SELECT 1 FROM "audit_logs" WHERE "action" = 'inventory.batch.legacy_create'`);
    expect(audits.rowCount).toBe(2);
  });

  it("is idempotent: running the carry-over again changes nothing", async () => {
    const movements = (await client.query(`SELECT count(*)::int AS n FROM "stock_movements"`)).rows[0];
    const again = await client.query<{ n: number }>(`SELECT "stock_carry_over_to_legacy_batches"() AS n`);
    expect(again.rows[0]?.n).toBe(0);
    expect((await client.query(`SELECT count(*)::int AS n FROM "stock_movements"`)).rows[0]).toEqual(movements);
    expect(await totals()).toEqual(before);
  });
});
