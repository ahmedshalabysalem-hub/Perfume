import { expect, test } from "@playwright/test";
import { USERS } from "./support/env";
import { open, signIn, uniqueSuffix } from "./support/helpers";

test.describe("suppliers", () => {
  test("create supplier → contact → linked product with last cost → list and history", async ({ page }) => {
    const suffix = uniqueSuffix();
    const code = `E2E-${suffix}`;
    const nameEn = `E2E Amber Supplies ${suffix}`;

    await signIn(page, USERS.procurementSa);
    await open(page, "/en/admin/procurement/suppliers");
    await page.getByTestId("new-supplier").click();
    const form = page.getByTestId("supplier-form");
    await form.locator("[name=code]").fill(code);
    await form.locator("[name=nameEn]").fill(nameEn);
    await form.locator("[name=nameAr]").fill(`موردو العنبر ${suffix}`);
    await form.locator("[name=supplierCountryCode]").fill("EG");
    // A Saudi-format number is refused for an Egyptian supplier.
    await form.locator("[name=taxRegistrationNo]").fill("300000000000003");
    await form.locator("[name=paymentTermDays]").fill("45");
    await page.getByTestId("supplier-form-submit").click();
    await expect(form.locator("[name=taxRegistrationNo]")).toHaveAttribute("aria-invalid", "true");
    await form.locator("[name=taxRegistrationNo]").fill("123456789");
    await page.getByTestId("supplier-form-submit").click();
    await expect(page).toHaveURL(/\/en\/admin\/procurement\/suppliers\/[0-9a-f-]{36}$/);
    const supplierUrl = page.url();

    await page.getByTestId("tab-contacts").click();
    await page.getByTestId("add-contact").click();
    const contact = page.getByTestId("contact-form");
    await contact.locator("[name=name]").fill("Mona Adel");
    await contact.locator("[name=email]").fill("mona@amber.example");
    await page.getByTestId("contact-form-submit").click();
    await expect(page.getByTestId("contact-list")).toContainText("Mona Adel");

    await page.getByTestId("tab-products").click();
    await page.getByTestId("add-supplier-product").click();
    const product = page.getByTestId("supplier-product-form");
    await product.locator("[name=variantCode]").fill("qa-tre-30");
    await product.locator("[name=supplierSku]").fill("amb-tre-030");
    await product.locator("[name=lastCostAmount]").fill("42.5");
    await page.getByTestId("supplier-product-form-submit").click();
    const row = page.locator('[data-testid=supplier-product-row][data-sku="QA-TRE-30"]');
    await expect(row).toContainText("AMB-TRE-030");
    await expect(row.getByTestId("last-cost")).toHaveText("SAR 42.50");

    await open(page, `/en/admin/procurement/suppliers?q=${encodeURIComponent(code)}`);
    const listRow = page.locator(`[data-testid=supplier-row][data-code="${code}"]`);
    await expect(listRow).toContainText("Net 45 days");
    await expect(listRow).toContainText("Mona Adel");

    await open(page, `${supplierUrl}?tab=history`);
    const history = page.getByTestId("history-list");
    await expect(history).toContainText("procurement.supplier_product.create");
    await expect(history).toContainText("procurement.supplier_contact.create");
    await expect(history).toContainText("procurement.supplier.create");

    // The same page in Arabic, right to left.
    await open(page, supplierUrl.replace("/en/", "/ar/"));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("tab-products")).toHaveText("المنتجات");
  });

  test("is hidden from staff without supplier access", async ({ page }) => {
    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/procurement/suppliers");
    await expect(page.getByTestId("no-access")).toBeVisible();
  });
});
