import { expect, test } from "@playwright/test";
import { USERS } from "./support/env";
import { open, signIn } from "./support/helpers";

test.describe("access control", () => {
  test("a store cashier can look products up but not manage them or staff", async ({ page }) => {
    await signIn(page, USERS.cashier);

    await open(page, "/en/admin/catalog/products");
    await expect(page.getByTestId("product-row").first()).toBeVisible();
    await expect(page.getByTestId("new-product")).toHaveCount(0);

    for (const path of ["/en/admin/catalog/products/new", "/en/admin/access/users", "/en/admin/access/audit"]) {
      await open(page, path);
      await expect(page.getByTestId("no-access")).toBeVisible();
    }

    // Product pages are read-only: no variant, price or status controls.
    await open(page, "/en/admin/catalog/products?q=QA-ROI-50");
    await page.getByTestId("exact-match").getByRole("link").click();
    await page.getByTestId("tab-variants").click();
    await expect(page.getByTestId("variants-panel")).toBeVisible();
    await expect(page.getByTestId("add-variant")).toHaveCount(0);
    await expect(page.getByTestId("edit-prices-QA-ROI-50")).toHaveCount(0);
    await expect(page.locator("[data-testid^=status-]")).toHaveCount(0);
  });

  test("a KSA business manager edits Saudi prices only and cannot create houses", async ({ page }) => {
    await signIn(page, USERS.managerSa);

    await open(page, "/en/admin/catalog/brands");
    await expect(page.getByTestId("brand-row").first()).toBeVisible();
    await expect(page.getByTestId("new-brand")).toHaveCount(0);

    await open(page, "/en/admin/catalog/products?q=QA-ROI-50");
    await page.getByTestId("exact-match").getByRole("link").click();
    await page.getByTestId("tab-variants").click();
    await page.getByTestId("edit-prices-QA-ROI-50").click();
    const prices = page.getByTestId("prices-form");
    await expect(prices.locator("[data-field=price-SA]")).toBeEnabled();
    await expect(prices.locator("[data-field=price-EG]")).toBeDisabled();

    // The audit log is global-only.
    await open(page, "/en/admin/access/audit");
    await expect(page.getByTestId("no-access")).toBeVisible();
  });
});
