import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { e2eDatabaseUrl, USERS } from "./support/env";
import { open, signIn } from "./support/helpers";

/**
 * Stock recorded before batches existed, carried over exactly as the INV-002
 * migration does (the guards it created afterwards are paused in this one
 * transaction only).
 */
async function seedLegacyStock(sku: string, warehouseCode: string, quantity: number): Promise<void> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const [table, trigger] of [
      ["stock_balances", "stock_balances_batch_rules"],
      ["stock_balances", "stock_balances_sellable_guard"],
      ["stock_movements", "stock_movements_batch_rules"],
    ]) {
      await client.query(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
    }
    const ids = await client.query<{ variant_id: string; warehouse_id: string }>(
      `SELECT v."id" AS variant_id, w."id" AS warehouse_id FROM "product_variants" v, "warehouses" w
        WHERE v."sku" = $1 AND w."code" = $2`,
      [sku, warehouseCode],
    );
    const { variant_id: variantId, warehouse_id: warehouseId } = ids.rows[0]!;
    await client.query(
      `INSERT INTO "stock_balances" ("id", "variant_id", "warehouse_id", "status", "on_hand", "reserved", "updated_at")
       VALUES (gen_random_uuid(), $1, $2, 'SELLABLE', $3, 0, now())`,
      [variantId, warehouseId, quantity],
    );
    await client.query(
      `INSERT INTO "stock_movements" ("id", "posted_at", "type", "variant_id", "warehouse_id", "status", "quantity",
                                      "balance_after", "unit_cost", "currency_code", "reason", "actor_type", "correlation_id", "idempotency_key", "line_no")
       VALUES (gen_random_uuid(), now(), 'OPENING_BALANCE', $1, $2, 'SELLABLE', $3, $3, 95, 'SAR', 'Before batches', 'SYSTEM', 'e2e',
               'e2e-legacy-' || gen_random_uuid(), 1)`,
      [variantId, warehouseId, quantity],
    );
    await client.query(`SELECT "stock_carry_over_to_legacy_batches"()`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function decide(page: Page, label: string, reason: string) {
  const form = page.getByTestId("batch-status-form");
  await form.locator("[data-field=status]").selectOption({ label });
  await form.locator("[data-field=reason]").fill(reason);
  await page.getByTestId("batch-status-submit").click();
  await expect(page.getByText("Decision recorded.")).toBeVisible();
}

test.describe("inventory", () => {
  test("an admin enters an opening balance for a lot and sees it in stock and the ledger", async ({ page }) => {
    await signIn(page, USERS.admin);
    await open(page, "/en/admin/inventory/stock");
    await page.getByTestId("new-opening-balance").click();
    await page.waitForLoadState("networkidle");

    const form = page.getByTestId("opening-balance-form");
    await form.locator("[data-field=variantCode]").fill("qa-roi-100");
    await form.locator("[data-field=warehouseId]").selectOption({ label: "SA-RUH-WH1 · Riyadh Main Warehouse" });
    await expect(form.getByText("Unit cost (SAR)")).toBeVisible();
    await form.locator("[data-field=quantity]").fill("12");
    await form.locator("[data-field=unitCost]").fill("210.125");
    await form.locator("[data-field=reason]").fill("Go-live stock count");
    // QA-ROI-100 tracks batches: the lot is required.
    await page.getByTestId("opening-balance-submit").click();
    await expect(form.getByText("This variant tracks batches: enter the lot number.")).toBeVisible();
    await form.locator("[data-field=lotNumber]").fill("qa-lot-1");
    await form.locator("[data-field=expiresOn]").fill("2030-06");
    await page.getByTestId("opening-balance-submit").click();
    await expect(page.getByText("Opening balance posted.")).toBeVisible();
    await expect(form.locator("[data-field=variantCode]")).toHaveValue("");

    // Posting the same balance twice is refused.
    await form.locator("[data-field=variantCode]").fill("QA-ROI-100");
    await form.locator("[data-field=quantity]").fill("1");
    await form.locator("[data-field=unitCost]").fill("1");
    await form.locator("[data-field=lotNumber]").fill("QA-LOT-1");
    await page.getByTestId("opening-balance-submit").click();
    await expect(page.getByText(/already has stock history/)).toBeVisible();

    await open(page, "/en/admin/inventory/stock?q=QA-ROI-100");
    const row = page.locator("[data-testid=stock-row][data-sku=QA-ROI-100]");
    await expect(row.getByTestId("stock-on-hand")).toHaveText("12");
    await row.getByRole("link").click();
    await page.waitForLoadState("networkidle");
    const movement = page.getByTestId("movement-row");
    await expect(movement).toHaveCount(1);
    await expect(movement).toContainText("Opening balance");
    await expect(movement).toContainText("+12");
    await expect(movement).toContainText("210.125");
    await expect(movement).toContainText("Go-live stock count");

    // The same page in Arabic.
    await open(page, "/ar/admin/inventory/stock?q=QA-ROI-100");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "أرصدة المخزون" })).toBeVisible();
    await expect(page.locator("[data-testid=stock-row][data-sku=QA-ROI-100]")).toContainText("قابل للبيع");
  });

  test("a lot is quarantined and released, and only then counts as sellable", async ({ page }) => {
    await signIn(page, USERS.admin);
    await open(page, "/en/admin/inventory/opening-balances/new");
    const form = page.getByTestId("opening-balance-form");
    await form.locator("[data-field=variantCode]").fill("QA-ROI-50");
    await form.locator("[data-field=warehouseId]").selectOption({ label: "SA-RUH-WH1 · Riyadh Main Warehouse" });
    await form.locator("[data-field=status]").selectOption({ label: "Quarantined" });
    await form.locator("[data-field=quantity]").fill("9");
    await form.locator("[data-field=unitCost]").fill("95");
    await form.locator("[data-field=lotNumber]").fill("QA-LOT-50");
    await form.locator("[data-field=expiresOn]").fill("2031-01-15");
    await form.locator("[data-field=reason]").fill("Received for inspection");
    await page.getByTestId("opening-balance-submit").click();
    await expect(page.getByText("Opening balance posted.")).toBeVisible();

    await open(page, "/en/admin/inventory/batches?q=QA-LOT-50");
    const row = page.locator("[data-testid=batch-row][data-lot=QA-LOT-50]");
    await expect(row).toContainText("Pending inspection");
    await expect(row).toContainText("Not released");
    await row.getByRole("link").click();
    await page.waitForLoadState("networkidle");

    await decide(page, "Quarantine", "Outer cartons damp");
    await expect(page.getByTestId("batch-inspection")).toContainText("Quarantined");
    await decide(page, "Release for sale", "Bottles inspected, all intact");
    await expect(page.getByTestId("batch-inspection")).toContainText("Released");
    await expect(page.getByTestId("batch-eligibility")).toContainText("Sellable");
    const sellable = page.locator("[data-testid=batch-balance-row][data-status=SELLABLE]");
    await expect(sellable.getByTestId("batch-available-for-sale")).toHaveText("9");
    await expect(page.locator("[data-testid=batch-movement-row][data-type=INSPECTION]")).toHaveCount(2);
    await expect(page.getByTestId("batch-history-row").first()).toContainText("Bottles inspected, all intact");
  });

  test("legacy stock is sellable only after verification and a separate release", async ({ page }) => {
    await seedLegacyStock("QA-ROI-50", "SA-RUH-WH1", 4);
    await signIn(page, USERS.admin);
    await open(page, "/en/admin/inventory/batches?q=QA-ROI-50&incomplete=1");
    const row = page.locator("[data-testid=batch-row][data-sku=QA-ROI-50]");
    await expect(row).toContainText("LEGACY");
    await expect(row).toContainText("Unknown");
    await row.getByRole("link").click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("legacy-awaiting-verification")).toBeVisible();

    // Release before verification is refused.
    const status = page.getByTestId("batch-status-form");
    await status.locator("[data-field=status]").selectOption({ label: "Release for sale" });
    await status.locator("[data-field=reason]").fill("Looks fine");
    await page.getByTestId("batch-status-submit").click();
    await expect(page.getByText("Record a passing verification before releasing this batch.")).toBeVisible();

    const verify = page.getByTestId("batch-verify-form");
    await verify.locator("[data-field=physicalCheckOk]").selectOption({ label: "Pass" });
    await verify.locator("[data-field=labelCheckOk]").selectOption({ label: "Pass" });
    await expect(verify.locator("[data-field=expiryOutcome]")).toHaveValue("UNKNOWN");
    await verify.locator("[data-field=reason]").fill("Shelf check, no date printed");
    await page.getByTestId("batch-verify-submit").click();
    await expect(page.getByText("Verification recorded.")).toBeVisible();
    await expect(page.getByTestId("batch-verification")).toHaveAttribute("data-result", "PASSED");
    // Verification alone does not make it sellable.
    await expect(page.getByTestId("batch-inspection")).toContainText("Pending inspection");
    await expect(page.getByTestId("batch-available-for-sale")).toHaveText("0");

    await decide(page, "Release for sale", "Verified; expiry unknown");
    await expect(page.getByTestId("batch-eligibility")).toContainText("Sellable");
    await expect(page.getByTestId("batch-available-for-sale")).toHaveText("4");

    await open(page, "/ar/admin/inventory/batches?q=QA-ROI-50");
    await expect(page.getByRole("heading", { name: "التشغيلات والصلاحية" })).toBeVisible();
    await expect(page.locator("[data-testid=batch-row][data-sku=QA-ROI-50]").first()).toContainText("قابل للبيع");
  });

  test("stock pages follow inventory permissions", async ({ page }) => {
    await signIn(page, USERS.cashier);
    await open(page, "/en/admin/inventory/stock");
    await expect(page.getByTestId("no-access")).toBeVisible();
    await open(page, "/en/admin/inventory/opening-balances/new");
    await expect(page.getByTestId("no-access")).toBeVisible();
  });
});
