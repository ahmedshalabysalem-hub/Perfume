import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "./support/env";

test.describe("authentication", () => {
  test("sends anonymous visitors from the back office to the sign-in page", async ({ page }) => {
    await page.goto("/en/admin/catalog/products");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fadmin%2Fcatalog%2Fproducts$/);
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("rejects a wrong password with a generic message", async ({ page }) => {
    await page.goto("/en/login");
    const form = page.getByTestId("login-form");
    const submit = form.locator("button[type=submit]");
    await expect(submit).toBeEnabled();
    await form.locator("input[type=email]").fill(USERS.admin);
    await form.locator("input[type=password]").fill("Not-The-Right-Password-1");
    await submit.click();
    await expect(form.getByRole("alert")).toHaveText("Incorrect e-mail or password, or the account is not active.");
    await expect(page).toHaveURL(/\/en\/login$/);
    // The password never ends up in the URL.
    expect(page.url()).not.toContain("Not-The-Right");
  });

  test("signs in, returns to the requested page, and signs out", async ({ page }) => {
    await page.goto("/en/admin/catalog/brands");
    const form = page.getByTestId("login-form");
    const submit = form.locator("button[type=submit]");
    await expect(submit).toBeEnabled();
    await form.locator("input[type=email]").fill(USERS.admin);
    await form.locator("input[type=password]").fill(E2E_PASSWORD);
    await submit.click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog\/brands$/);
    await expect(page.getByTestId("brand-row").first()).toBeVisible();

    await page.getByTestId("user-menu").click();
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fadmin$/);
  });
});
