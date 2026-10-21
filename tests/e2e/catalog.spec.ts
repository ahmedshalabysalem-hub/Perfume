import { expect, test } from "@playwright/test";
import { USERS } from "./support/env";
import { demoEan13, open, signIn, uniqueSuffix } from "./support/helpers";

test.describe("product catalogue", () => {
  test("create → variant → market prices → publish → storefront → unpublish", async ({ page }) => {
    const suffix = uniqueSuffix();
    const nameEn = `E2E Saffron ${suffix}`;
    const sku = `E2E-${suffix}-100`;
    const barcode = demoEan13();

    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/catalog/products/new");
    const form = page.getByTestId("product-form");
    await form.locator("[name=nameEn]").fill(nameEn);
    await form.locator("[name=nameAr]").fill(`زعفران ${suffix}`);
    await form.locator("[name=brandId]").selectOption({ label: "Qamar Atelier" });
    await form.locator("[name=audience]").selectOption("UNISEX");
    await page.getByTestId("product-form-submit").click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog\/products\/[0-9a-f-]{36}$/);
    const adminUrl = page.url();

    // Variant with a scanned manufacturer barcode (GS1 demo range).
    await page.getByTestId("tab-variants").click();
    await page.getByTestId("add-variant").click();
    const variantForm = page.getByTestId("variant-form");
    await variantForm.locator("[name=sku]").fill(sku);
    await variantForm.locator("[name=sizeMl]").fill("100");
    await variantForm.locator("#variant-barcode").fill(barcode);
    await variantForm.locator("#variant-barcode").blur();
    await expect(variantForm.locator("[name=barcodeType]")).toHaveValue("EAN_13");
    await expect(variantForm.locator("[name=barcodeSource]")).toHaveValue("MANUFACTURER");
    await page.getByTestId("variant-form-submit").click();
    const row = page.locator(`[data-testid=variant-row][data-sku="${sku}"]`);
    await expect(row).toContainText(barcode);

    // Prices per market, each in its own currency.
    await page.getByTestId(`edit-prices-${sku}`).click();
    const prices = page.getByTestId("prices-form");
    await prices.locator("[data-field=price-SA]").fill("199.50");
    await prices.locator("[data-field=price-EG]").fill("2400");
    await page.getByTestId("prices-form-submit").click();
    await expect(row.locator("[data-price=SA]")).toHaveText("SAR 199.50");
    await expect(row.locator("[data-price=EG]")).toHaveText("EGP 2,400.00");

    await page.getByTestId("status-publish").click();
    await page.getByTestId("status-publish-confirm").click();
    await expect(page.getByTestId("status-unpublish")).toBeVisible();

    // The storefront lists it with the visitor's market price.
    await open(page, `/en/products?q=${encodeURIComponent(nameEn)}`);
    const card = page.getByTestId("product-card").filter({ hasText: nameEn });
    await expect(card).toContainText("SAR 199.50");
    await card.click();
    await expect(page.getByTestId("product-name")).toHaveText(nameEn);
    const storeUrl = page.url();
    await page.getByTestId("market-switcher").selectOption("EG");
    await expect(page.getByTestId("price")).toHaveText("EGP 2,400.00");

    // Unpublishing removes it from the storefront.
    await open(page, adminUrl);
    await page.getByTestId("status-unpublish").click();
    await page.getByRole("alertdialog").locator("textarea").fill("E2E: withdrawn from sale");
    await page.getByTestId("status-unpublish-confirm").click();
    await expect(page.getByTestId("status-publish")).toBeVisible();
    const response = await page.goto(storeUrl);
    expect(response?.status()).toBe(404);

    // Every step is in the product history.
    await open(page, adminUrl);
    await page.getByTestId("tab-history").click();
    await expect(page.getByTestId("history-list")).toContainText("E2E: withdrawn from sale");
  });

  test("explains a duplicate SKU instead of saving it", async ({ page }) => {
    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/catalog/products?q=QA-ROI-50");
    await page.getByTestId("exact-match").getByRole("link").click();
    await page.getByTestId("tab-variants").click();
    await page.getByTestId("add-variant").click();
    const form = page.getByTestId("variant-form");
    await form.locator("[name=sku]").fill(" qa-roi-50 ");
    await page.getByTestId("variant-form-submit").click();
    await expect(form.getByRole("alert").first()).toHaveText("This SKU is already used by another variant.");
    await expect(page.locator("[data-testid=variant-row][data-sku='QA-ROI-50']")).toHaveCount(1);
  });

  test("finds a variant by scanning its barcode", async ({ page }) => {
    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/catalog/products");
    const search = page.getByTestId("list-search");
    await search.fill("9520000100018");
    await search.press("Enter");
    await expect(page.getByTestId("exact-match")).toContainText("QA-ROI-50");
    await expect(page.getByTestId("product-row")).toHaveCount(1);
    await expect(page.getByTestId("product-row")).toContainText("Royal Oud Intense");
  });

  test("validates required fields with clear messages", async ({ page }) => {
    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/catalog/products/new");
    await page.getByTestId("product-form-submit").click();
    const form = page.getByTestId("product-form");
    await expect(form.getByRole("alert").first()).toBeVisible();
    await expect(form.getByRole("alert")).toContainText(["This field is required."]);
    await expect(page).toHaveURL(/\/products\/new$/);
  });
});
