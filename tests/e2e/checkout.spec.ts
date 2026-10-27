import { expect, test, type Page } from "@playwright/test";
import { USERS } from "./support/env";
import { open, signIn } from "./support/helpers";
import { seedReleasedStock } from "./support/stock";

// ORD-001 (ADR-025): browse → cart → guest checkout → confirmation → order
// administration. Each test stocks its own SKU so tests stay independent;
// the seed itself holds no stock. Checkout is rate limited per client
// address, so every test presents its own documentation-range address.

let clientSeq = 0;
test.beforeEach(async ({ context }) => {
  clientSeq += 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${clientSeq + Math.floor(Math.random() * 200)}` });
});

async function addVariantFromProductPage(page: Page, slug: string, sizeLabel: RegExp, quantity = 1) {
  await open(page, `/en/products/${slug}`);
  await page.getByTestId("variant-option").filter({ hasText: sizeLabel }).click();
  await expect(page.getByTestId("stock-status")).toHaveText("In stock");
  for (let index = 1; index < quantity; index += 1) {
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Increase quantity" }).click();
  }
  await page.getByTestId("add-to-cart-button").click();
}

/** One mobile number per order: a number may only have a few orders awaiting review. */
const nextPhone = () => `055${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-7)}`;

async function fillSaudiDetails(page: Page, name: string, phone = nextPhone()) {
  await page.locator("[data-field=name]").fill(name);
  await page.locator("[data-field=phone]").fill(phone);
  await page.locator("[data-field=email]").fill("guest@example.com");
  await page.locator("[data-field=city]").fill("Riyadh");
  await page.locator("[data-field=district]").fill("Al Olaya");
  await page.locator("[data-field=street]").fill("King Fahd Road");
  await page.locator("[data-field=buildingNumber]").fill("1234");
}

test.describe("guest checkout", () => {
  test.describe("on a phone, in Arabic", () => {
    test.use({ viewport: { width: 390, height: 844 }, locale: "ar-SA" });

    test("A/F/G: browse, add to cart, check out as a guest and see the confirmation", async ({ page, browser }) => {
      await seedReleasedStock("QA-TRE-75", "SA-RUH-WH1", 5);
      await open(page, "/ar/products/taif-rose-eau-de-parfum");
      await page.getByTestId("variant-option").filter({ hasText: "75" }).click();
      await expect(page.getByTestId("stock-status")).toHaveText("متوفر");
      await page.getByTestId("add-to-cart").getByRole("button", { name: "زيادة الكمية" }).click();
      await page.getByTestId("add-to-cart-button").click();
      await expect(page.getByTestId("cart-count")).toHaveText("2");

      // The cart survives a reload and a new tab (browser storage), then is priced by the server.
      await page.reload();
      await expect(page.getByTestId("cart-count")).toHaveText("2");
      await page.getByTestId("cart-indicator").click();
      await expect(page).toHaveURL(/\/ar\/cart$/);
      const line = page.getByTestId("cart-line");
      await expect(line).toHaveCount(1);
      await expect(line.getByTestId("line-total")).toContainText("1,080.00");
      await expect(page.getByTestId("cart-subtotal")).toContainText("1,080.00");
      await line.getByRole("button", { name: "تقليل الكمية" }).click();
      await expect(page.getByTestId("cart-subtotal")).toContainText("540.00");
      await expect(page.getByTestId("cart-count")).toHaveText("1");

      await page.getByTestId("go-to-checkout").click();
      await expect(page).toHaveURL(/\/ar\/checkout$/);
      await expect(page.getByTestId("checkout-line")).toHaveCount(1);
      // Saudi address fields: no governorate list, short address offered.
      await expect(page.locator("[data-field=region]")).toHaveCount(0);
      await expect(page.locator("[data-field=shortAddress]")).toBeVisible();
      await page.locator("[data-field=name]").fill("سارة أحمد");
      await page.locator("[data-field=phone]").fill("٠٥٥١٢٣٤٥٦٧");
      await page.locator("[data-field=city]").fill("الرياض");
      await page.locator("[data-field=district]").fill("العليا");
      await page.locator("[data-field=street]").fill("طريق الملك فهد");
      await page.getByTestId("place-order").click();

      await expect(page).toHaveURL(/\/ar\/checkout\/confirmation\/SA-\d{6}$/);
      const confirmation = page.getByTestId("order-confirmation");
      await expect(confirmation.getByTestId("order-number")).toHaveText(/^SA-\d{6}$/);
      await expect(confirmation.getByTestId("order-status")).toHaveText("قيد المراجعة");
      await expect(confirmation.getByTestId("payment-status")).toHaveText("غير مدفوع");
      await expect(confirmation.getByTestId("confirmation-subtotal")).toContainText("540.00");
      await expect(confirmation.getByTestId("next-steps")).toContainText("567");
      await expect(page.getByTestId("cart-count")).toHaveCount(0);

      // The order number alone does not open the confirmation in another browser.
      const stranger = await browser.newContext();
      const other = await stranger.newPage();
      await other.goto(page.url());
      await expect(other.getByTestId("confirmation-missing")).toBeVisible();
      await stranger.close();
    });
  });

  test("B: invalid contact and address details are refused before anything is ordered", async ({ page }) => {
    await seedReleasedStock("QA-TRE-75", "SA-RUH-WH1", 2);
    await addVariantFromProductPage(page, "taif-rose-eau-de-parfum", /75/);
    await open(page, "/en/checkout");
    await page.getByTestId("place-order").click();
    await expect(page.getByText("This field is required.").first()).toBeVisible();
    await page.locator("[data-field=name]").fill("Sara Ahmed");
    await page.locator("[data-field=phone]").fill("0123");
    await page.locator("[data-field=email]").fill("not-an-email");
    await page.locator("[data-field=city]").fill("Riyadh");
    await page.locator("[data-field=district]").fill("Olaya");
    await page.locator("[data-field=street]").fill("King Fahd Road");
    await page.locator("[data-field=buildingNumber]").fill("12");
    await page.getByTestId("place-order").click();
    await expect(page.locator("[data-field=phone]")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("[data-field=email]")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("[data-field=buildingNumber]")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/en\/checkout$/);
  });

  test("C: a quantity above the available stock blocks checkout until it is reduced", async ({ page }) => {
    await seedReleasedStock("NS-DVT-100-T", "SA-RUH-WH1", 1);
    await open(page, "/en/products/desert-vetiver");
    await page.getByTestId("variant-option").filter({ hasText: "Tester" }).click();
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Increase quantity" }).click();
    await page.getByTestId("add-to-cart-button").click();
    await open(page, "/en/cart");
    const line = page.getByTestId("cart-line");
    await expect(line.getByTestId("line-problem")).toContainText("Not enough stock");
    await expect(page.getByTestId("go-to-checkout")).toBeDisabled();
    await line.getByRole("button", { name: "Decrease quantity" }).click();
    await expect(line.getByTestId("line-problem")).toHaveCount(0);
    await expect(page.getByTestId("go-to-checkout")).toBeEnabled();
  });

  test("D/E: double submission creates one unpaid order and no payment is asked for", async ({ page }) => {
    await seedReleasedStock("NS-DVT-100", "SA-RUH-WH1", 5);
    await addVariantFromProductPage(page, "desert-vetiver", /^100 ml$/);
    await open(page, "/en/checkout");
    await expect(page.getByTestId("payment-notice")).toContainText("No online payment");
    await expect(page.locator("input[autocomplete^=cc-], input[name*=card i]")).toHaveCount(0);
    const name = `Double Click ${Date.now()}`;
    await fillSaudiDetails(page, name);
    await page.getByTestId("place-order").dblclick();
    await expect(page).toHaveURL(/\/en\/checkout\/confirmation\/SA-\d{6}$/);
    await expect(page.getByTestId("payment-status")).toHaveText("Not paid");

    await signIn(page, USERS.admin);
    await open(page, `/en/admin/orders?q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("order-row")).toHaveCount(1);
    await expect(page.getByTestId("order-row")).toContainText("Not paid");
  });
});

test.describe("markets and companies", () => {
  test("H: each market keeps its own cart, currency and company; staff only see their scope", async ({ page }) => {
    await seedReleasedStock("NS-MAT-12", "SA-RUH-WH1", 5);
    await seedReleasedStock("NS-DVT-100", "EG-CAI-WH1", 3);

    // A single-size product is added straight from the listing in Saudi Arabia.
    await open(page, "/en/products");
    const oil = page.getByTestId("product-card").filter({ hasText: "Musk Al Tahara Perfume Oil" });
    await oil.getByTestId("quick-add").click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    // Egypt has a separate, empty cart priced in EGP.
    await page.getByTestId("market-switcher").selectOption("EG");
    await expect(page.getByTestId("cart-indicator")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
    await addVariantFromProductPage(page, "desert-vetiver", /^100 ml$/);
    await open(page, "/en/cart");
    await expect(page.getByTestId("cart-subtotal")).toContainText("EGP 4,950.00");
    await page.getByTestId("go-to-checkout").click();
    // Egyptian address: governorate list, no Saudi short address.
    await expect(page.locator("[data-field=shortAddress]")).toHaveCount(0);
    await page.locator("[data-field=name]").fill("Mona Hassan");
    await page.locator("[data-field=phone]").fill("01012345678");
    await page.locator("[data-field=region]").selectOption("GZ");
    await page.locator("[data-field=city]").fill("Dokki");
    await page.locator("[data-field=street]").fill("Tahrir Street");
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/en\/checkout\/confirmation\/EG-\d{6}$/);
    const egNumber = (await page.getByTestId("order-number").textContent())!;

    // The Saudi cart is still there.
    await page.getByTestId("market-switcher").selectOption("SA");
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    // A Saudi manager cannot see the Egyptian order, by list or by address.
    await signIn(page, USERS.admin);
    await open(page, `/en/admin/orders?q=${egNumber}`);
    await page.getByTestId("order-row").getByRole("link").click();
    await expect(page.getByTestId("order-address")).toContainText("Giza");
    const egOrderUrl = page.url();
    await page.context().clearCookies();
    await signIn(page, USERS.managerSa);
    await open(page, `/en/admin/orders?q=${egNumber}`);
    await expect(page.getByTestId("order-row")).toHaveCount(0);
    const response = await page.goto(egOrderUrl);
    expect(response?.status()).toBe(404);
  });
});

test.describe("order administration", () => {
  test("I: the reserved last unit is unavailable until staff cancel the order", async ({ page, browser }) => {
    await seedReleasedStock("ML-ANG-SET", "SA-RUH-WH1", 1);
    await open(page, "/en/products/amber-nights-gift-set");
    await expect(page.getByTestId("stock-status")).toHaveText("In stock");
    await page.getByTestId("add-to-cart-button").click();
    await open(page, "/en/checkout");
    await fillSaudiDetails(page, `Last Unit ${Date.now()}`);
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/confirmation\/SA-\d{6}$/);
    const number = (await page.getByTestId("order-number").textContent())!;

    // Another shopper sees it as out of stock: the unit is reserved.
    const shopper = await browser.newContext();
    const other = await shopper.newPage();
    await other.goto("/en/products/amber-nights-gift-set");
    await expect(other.getByTestId("stock-status")).toHaveText("Out of stock");

    await signIn(page, USERS.admin);
    await open(page, `/en/admin/orders?q=${number}`);
    await page.getByTestId("order-row").getByRole("link").click();
    await expect(page.getByTestId("order-status")).toHaveText("Awaiting review");
    await expect(page.getByTestId("item-reservations")).toContainText("1 reserved");
    await page.locator("[data-field=reason]").fill("Customer asked to cancel");
    await page.getByTestId("order-cancel-submit").click();
    await page.getByTestId("order-cancel-apply").click();
    await expect(page.getByTestId("order-status")).toHaveText("Cancelled");
    await expect(page.getByTestId("item-reservations")).toContainText("1 released");

    await other.reload();
    await expect(other.getByTestId("stock-status")).toHaveText("In stock");
    await shopper.close();
  });

  test("staff confirm an order with a delivery fee; it stays unpaid", async ({ page }) => {
    await seedReleasedStock("QA-TRE-75", "SA-RUH-WH1", 2);
    await addVariantFromProductPage(page, "taif-rose-eau-de-parfum", /75/);
    await open(page, "/en/checkout");
    await fillSaudiDetails(page, `Confirm Me ${Date.now()}`, "0551234567");
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/confirmation\/SA-\d{6}$/);
    const number = (await page.getByTestId("order-number").textContent())!;

    await signIn(page, USERS.managerSa);
    await open(page, `/en/admin/orders?q=${number}`);
    await page.getByTestId("order-row").getByRole("link").click();
    await expect(page.getByTestId("order-customer")).toContainText("+966551234567");
    await page.locator("[data-field=shippingFee]").fill("25.5");
    await page.getByTestId("order-confirm-submit").click();
    await expect(page.getByTestId("order-status")).toHaveText("Confirmed");
    await expect(page.getByTestId("order-total")).toHaveText("SAR 565.50");
    await expect(page.getByTestId("payment-status")).toHaveText("Not paid");
  });
});
