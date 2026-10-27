import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_PASSWORD, USERS, e2eDatabaseUrl } from "./support/env";
import { open, signIn } from "./support/helpers";

// I18N-002: the language switch, its persistence, RTL/LTR, and the rule that
// language never changes market, currency or prices.

const html = (page: Page) => page.locator("html");

async function expectLocale(page: Page, locale: "ar" | "en") {
  await expect(html(page)).toHaveAttribute("lang", locale);
  await expect(html(page)).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}

async function signInWithoutTarget(browser: Browser, email: string) {
  // A fresh device: no cookies, English browser, no `next` target.
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/en/login");
  const form = page.getByTestId("login-form");
  await expect(form.locator("button[type=submit]")).toBeEnabled();
  await form.locator("input[type=email]").fill(email);
  await form.locator("input[type=password]").fill(E2E_PASSWORD);
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/(ar|en)\/admin$/);
  await page.waitForLoadState("networkidle");
  return { context, page };
}

test.describe("language switcher", () => {
  test("is offered in the storefront, sign-in and back-office layouts with both languages named", async ({ page }) => {
    for (const path of ["/en", "/en/login"]) {
      await open(page, path);
      await expect(page.getByTestId("locale-en")).toHaveText("English");
      await expect(page.getByTestId("locale-ar")).toHaveText("العربية");
      await expect(page.getByTestId("locale-en")).toHaveAttribute("aria-pressed", "true");
    }
    await signIn(page, USERS.catalog);
    await expect(page.getByTestId("locale-ar")).toHaveText("العربية");
    await expect(page.getByTestId("locale-en")).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps the back-office page and its query, and flips lang and dir both ways", async ({ page }) => {
    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/catalog/products?status=PUBLISHED");
    await expectLocale(page, "en");

    await page.getByTestId("locale-ar").click();
    await expect(page).toHaveURL(/\/ar\/admin\/catalog\/products\?status=PUBLISHED$/);
    await expectLocale(page, "ar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("المنتجات");

    await page.getByTestId("locale-en").click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog\/products\?status=PUBLISHED$/);
    await expectLocale(page, "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
  });

  test.describe("for a visitor", () => {
    test.use({ locale: "ar-SA" });

    test("remembers the choice across reloads and new visits to /", async ({ page, context }) => {
      await open(page, "/");
      await expect(page).toHaveURL(/\/ar$/);
      await page.getByTestId("locale-en").click();
      await expect(page).toHaveURL(/\/en$/);

      await page.reload();
      await expectLocale(page, "en");
      await open(page, "/");
      await expect(page).toHaveURL(/\/en$/);

      const cookie = (await context.cookies()).find((entry) => entry.name === "NEXT_LOCALE");
      expect(cookie?.value).toBe("en");
      // A lasting cookie, not a session cookie (about a year).
      expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(300 * 24 * 60 * 60);
    });
  });

  test("a signed-in user's choice is saved on the account and used on a new device", async ({ browser }) => {
    const first = await signInWithoutTarget(browser, USERS.managerSa);
    await expect(first.page).toHaveURL(/\/en\/admin$/);
    await first.page.getByTestId("locale-ar").click();
    await expect(first.page).toHaveURL(/\/ar\/admin$/);
    await first.context.close();

    const second = await signInWithoutTarget(browser, USERS.managerSa);
    await expect(second.page).toHaveURL(/\/ar\/admin$/);
    await expectLocale(second.page, "ar");
    // Restore English so other specs that sign this user in on /en are unaffected.
    await second.page.getByTestId("locale-en").click();
    await expect(second.page).toHaveURL(/\/en\/admin$/);
    await second.context.close();
  });

  test("asks before discarding a form with unsaved changes", async ({ page }) => {
    await signIn(page, USERS.catalog);
    await open(page, "/en/admin/catalog/products/new");
    await page.getByTestId("product-form").locator("input[name=nameEn]").fill("Unsaved draft");

    const questions: string[] = [];
    page.once("dialog", async (dialog) => {
      questions.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByTestId("locale-ar").click();
    await expect.poll(() => questions.length).toBe(1);
    expect(questions[0]).toContain("unsaved changes");
    // Give a switch that should not happen time to show up before checking.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/en\/admin\/catalog\/products\/new$/);
    await expect(page.getByTestId("product-form").locator("input[name=nameEn]")).toHaveValue("Unsaved draft");

    page.once("dialog", async (dialog) => {
      questions.push(dialog.message());
      await dialog.accept();
    });
    await page.getByTestId("locale-ar").click();
    await expect.poll(() => questions.length).toBe(2);
    await expect(page).toHaveURL(/\/ar\/admin\/catalog\/products\/new$/);
    await expect(page.getByTestId("product-form").locator("input[name=nameEn]")).toHaveValue("");
    // The switch was saved on the account: restore English for the other specs.
    await page.getByTestId("locale-en").click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog\/products\/new$/);
  });
});

test.describe("language is not currency", () => {
  test("Saudi prices stay in SAR and Egyptian prices in EGP in both languages", async ({ page }) => {
    await open(page, "/en/products");
    const market = page.getByTestId("market-switcher");
    const oil = page.getByTestId("product-card").filter({ hasText: "Musk Al Tahara Perfume Oil" });
    await expect(market).toHaveValue("SA");
    await expect(oil.getByTestId("price")).toHaveText("SAR 85.00");

    await page.getByTestId("locale-ar").click();
    await expect(page).toHaveURL(/\/ar\/products$/);
    await expect(market).toHaveValue("SA");
    const oilAr = page.getByTestId("product-card").filter({ hasText: "مسك الطهارة" });
    await expect(oilAr.getByTestId("price")).toContainText("85.00");
    await expect(oilAr.getByTestId("price")).toContainText("ر.س");

    await market.selectOption("EG");
    await expect(page.getByTestId("product-card").first().getByTestId("price")).toContainText("ج.م");
    const egyptAr = await page.getByTestId("price").allTextContents();

    await page.getByTestId("locale-en").click();
    await expect(page).toHaveURL(/\/en\/products$/);
    await expect(market).toHaveValue("EG");
    const egyptEn = await page.getByTestId("price").allTextContents();
    expect(egyptEn.length).toBe(egyptAr.length);
    for (const [index, text] of egyptEn.entries()) {
      expect(text).toMatch(/EGP\s[\d,]+\.\d{2}$/);
      // Same amount, only the currency label differs by language.
      expect(text.match(/[\d,]+\.\d{2}/)?.[0]).toBe(egyptAr[index]!.match(/[\d,]+\.\d{2}/)?.[0]);
    }
  });
});

test.describe("coverage of every implemented page", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every page renders in both languages with the right direction, no raw keys, Latin digits and no sideways scroll", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
    await client.connect();
    const one = async (sql: string) => String((await client.query(sql)).rows[0]?.id ?? "");
    const ids = {
      product: await one("select id from products order by created_at limit 1"),
      variant: await one("select id from product_variants order by created_at limit 1"),
      slug: await one("select slug as id from products where status = 'PUBLISHED' order by created_at limit 1"),
      user: await one("select id from users where type = 'STAFF' order by created_at limit 1"),
      supplier: await one("select id from suppliers order by created_at limit 1"),
      batch: await one("select id from stock_batches order by created_at limit 1"),
      order: await one("select id from orders order by placed_at limit 1"),
    };
    await client.end();

    const paths = [
      "",
      "/products",
      `/products/${ids.slug}`,
      "/cart",
      "/checkout",
      "/checkout/confirmation/SA-000001",
      "/account/password",
      "/no-such-page",
      "/admin",
      "/admin/orders",
      ...(ids.order ? [`/admin/orders/${ids.order}`] : []),
      "/admin/access/audit",
      "/admin/access/roles",
      "/admin/access/users",
      `/admin/access/users/${ids.user}`,
      "/admin/catalog/brands",
      "/admin/catalog/categories",
      "/admin/catalog/concentrations",
      "/admin/catalog/families",
      "/admin/catalog/notes",
      "/admin/catalog/products",
      "/admin/catalog/products/new",
      `/admin/catalog/products/${ids.product}`,
      `/admin/catalog/variants/${ids.variant}/label`,
      "/admin/inventory/batches",
      ...(ids.batch ? [`/admin/inventory/batches/${ids.batch}`] : []),
      "/admin/inventory/opening-balances/new",
      "/admin/inventory/stock",
      `/admin/inventory/stock/${ids.variant}`,
      "/admin/organization/countries",
      "/admin/organization/legal-entities",
      "/admin/organization/stores",
      "/admin/organization/warehouses",
      "/admin/procurement/suppliers",
      `/admin/procurement/suppliers/${ids.supplier}`,
    ];

    await signIn(page, USERS.admin);
    const problems: string[] = [];
    for (const locale of ["ar", "en"] as const) {
      for (const path of paths) {
        await open(page, `/${locale}${path}`);
        const result = await page.evaluate(() => {
          const technical = "code, .ltr-value, [dir=ltr], script, style";
          const keys: string[] = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const text = walker.currentNode.textContent?.trim() ?? "";
            const parent = walker.currentNode.parentElement;
            // A message key that failed to resolve renders as "namespace.key".
            if (parent && !parent.closest(technical) && /^[a-z][A-Za-z]*(\.[A-Za-z_]+)+$/.test(text)) keys.push(text);
          }
          return {
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            keys,
            arabicIndicDigits: /[٠-٩۰-۹]/.test(document.body.innerText),
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        });
        const where = `/${locale}${path}`;
        if (result.lang !== locale) problems.push(`${where}: lang=${result.lang}`);
        if (result.dir !== (locale === "ar" ? "rtl" : "ltr")) problems.push(`${where}: dir=${result.dir}`);
        if (result.keys.length > 0) problems.push(`${where}: raw keys ${result.keys.join(", ")}`);
        if (result.arabicIndicDigits) problems.push(`${where}: Arabic-Indic digits`);
        if (result.overflow) problems.push(`${where}: horizontal overflow at 390px`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("identifiers stay left-to-right inside the Arabic interface", async ({ page }) => {
    await signIn(page, USERS.admin, "ar");
    await open(page, "/ar/admin/access/users");
    const email = page.getByText(USERS.catalog, { exact: true });
    await expect(email).toHaveCSS("direction", "ltr");
    await open(page, "/ar/admin/catalog/products");
    const sku = page
      .locator(".ltr-value")
      .filter({ hasText: /^[A-Z0-9-]+$/ })
      .first();
    await expect(sku).toHaveCSS("direction", "ltr");
    await expect(html(page)).toHaveAttribute("dir", "rtl");
  });
});
