import { expect, test } from "@playwright/test";
import { open } from "./support/helpers";

test.describe("language negotiation", () => {
  test.describe("with an Arabic browser", () => {
    test.use({ locale: "ar-SA" });

    test("serves Arabic right-to-left, and English left-to-right after switching", async ({ page }) => {
      await open(page, "/");
      await expect(page).toHaveURL(/\/ar$/);
      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "ar");
      await expect(html).toHaveAttribute("dir", "rtl");

      await page.getByTestId("locale-switcher").click();
      await expect(page).toHaveURL(/\/en$/);
      await expect(html).toHaveAttribute("lang", "en");
      await expect(html).toHaveAttribute("dir", "ltr");
    });
  });

  test.describe("with a browser language the store does not offer", () => {
    test.use({ locale: "fr-FR" });

    test("falls back to the default language, Arabic", async ({ page }) => {
      await open(page, "/");
      await expect(page).toHaveURL(/\/ar$/);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    });
  });

  test("an English browser is served English", async ({ page }) => {
    await open(page, "/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test.describe("storefront", () => {
  test("switching language keeps the page and its filters", async ({ page }) => {
    await open(page, "/en/products?category=perfumes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Perfumes");
    await page.getByTestId("locale-switcher").click();
    await expect(page).toHaveURL(/\/ar\/products\?category=perfumes$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("العطور");
  });

  test("shows each market only what is priced there, in its currency", async ({ page }) => {
    await open(page, "/en/products");
    const oil = page.getByTestId("product-card").filter({ hasText: "Musk Al Tahara Perfume Oil" });
    await expect(oil).toContainText("SAR 85.00");

    await page.getByTestId("market-switcher").selectOption("EG");
    await expect(page.getByTestId("product-card").first()).toContainText("EGP");
    // Not priced for Egypt, so not offered there.
    await expect(oil).toHaveCount(0);
  });

  test("never exposes unpublished products", async ({ page }) => {
    const response = await page.goto("/en/products/citrus-breeze");
    expect(response?.status()).toBe(404);
    await open(page, "/en/products?q=citrus");
    await expect(page.getByTestId("store-empty")).toBeVisible();
  });

  test("Arabic validation messages on the sign-in form", async ({ page }) => {
    await page.goto("/ar/login");
    const form = page.getByTestId("login-form");
    const submit = form.locator("button[type=submit]");
    await expect(submit).toBeEnabled();
    await submit.click();
    const alert = form.getByRole("alert").first();
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(/[؀-ۿ]/);
  });
});
