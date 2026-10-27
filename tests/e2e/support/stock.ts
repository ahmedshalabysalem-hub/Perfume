import pg from "pg";
import { e2eDatabaseUrl } from "./env";

/**
 * Put sellable stock of `sku` into a warehouse for storefront tests: a new
 * RELEASED batch with a recorded expiry plus its opening-balance movement and
 * balance, written directly because the ledger service is server-only. All
 * database guards stay enabled, so the rows are ones the application could
 * have written itself.
 */
export async function seedReleasedStock(
  sku: string,
  warehouseCode: string,
  quantity: number,
  options: { expiresOn?: string; databaseUrl?: string } = {},
): Promise<{ batchId: string }> {
  const client = new pg.Client({ connectionString: options.databaseUrl ?? e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    const ids = await client.query<{
      variant_id: string;
      warehouse_id: string;
      legal_entity_id: string;
      country_code: string;
      currency_code: string;
    }>(
      `SELECT v."id" AS variant_id, w."id" AS warehouse_id, e."id" AS legal_entity_id,
              e."country_code", c."currency_code"
         FROM "product_variants" v, "warehouses" w
         JOIN "legal_entities" e ON e."id" = w."legal_entity_id"
         JOIN "countries" c ON c."code" = e."country_code"
        WHERE v."sku" = $1 AND w."code" = $2`,
      [sku, warehouseCode],
    );
    const row = ids.rows[0];
    if (!row) throw new Error(`No variant ${sku} or warehouse ${warehouseCode}`);
    const lot = `E2E-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6)}`;
    const batch = await client.query<{ id: string }>(
      `INSERT INTO "stock_batches" ("id", "legal_entity_id", "country_code", "variant_id", "lot_number",
                                    "expiry_basis", "expires_on", "expiry_precision", "inspection_status",
                                    "status_changed_at", "updated_at")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'RECORDED', $5, 'DAY', 'RELEASED', now(), now())
       RETURNING "id"`,
      [row.legal_entity_id, row.country_code, row.variant_id, lot, options.expiresOn ?? "2030-12-31"],
    );
    const batchId = batch.rows[0]!.id;
    await client.query(
      `INSERT INTO "stock_balances" ("id", "variant_id", "warehouse_id", "batch_id", "status", "on_hand", "reserved", "updated_at")
       VALUES (gen_random_uuid(), $1, $2, $3, 'SELLABLE', $4, 0, now())`,
      [row.variant_id, row.warehouse_id, batchId, quantity],
    );
    await client.query(
      `INSERT INTO "stock_movements" ("id", "posted_at", "type", "variant_id", "warehouse_id", "batch_id", "status",
                                      "quantity", "balance_after", "unit_cost", "currency_code", "reason",
                                      "actor_type", "correlation_id", "idempotency_key", "line_no")
       VALUES (gen_random_uuid(), now(), 'OPENING_BALANCE', $1, $2, $3, 'SELLABLE', $4, $4, 95, $5,
               'Storefront test stock', 'SYSTEM', 'e2e', 'e2e-stock-' || gen_random_uuid(), 1)`,
      [row.variant_id, row.warehouse_id, batchId, quantity, row.currency_code],
    );
    await client.query("COMMIT");
    return { batchId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
