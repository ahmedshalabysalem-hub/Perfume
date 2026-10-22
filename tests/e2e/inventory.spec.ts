import { expect, test } from "@playwright/test";
import { USERS } from "./support/env";
import { open, signIn } from "./support/helpers";

test.describe("inventory", () => {
  test("an admin enters an opening balance and sees it in stock and the ledger", async ({ page }) => {
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
    await page.getByTestId("opening-balance-submit").click();
    await expect(page.getByText("Opening balance posted.")).toBeVisible();
    await expect(form.locator("[data-field=variantCode]")).toHaveValue("");

    // Posting the same balance twice is refused.
    await form.locator("[data-field=variantCode]").fill("QA-ROI-100");
    await form.locator("[data-field=quantity]").fill("1");
    await form.locator("[data-field=unitCost]").fill("1");
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

  test("stock pages follow inventory permissions", async ({ page }) => {
    await signIn(page, USERS.cashier);
    await open(page, "/en/admin/inventory/stock");
    await expect(page.getByTestId("no-access")).toBeVisible();
    await open(page, "/en/admin/inventory/opening-balances/new");
    await expect(page.getByTestId("no-access")).toBeVisible();
  });
});
