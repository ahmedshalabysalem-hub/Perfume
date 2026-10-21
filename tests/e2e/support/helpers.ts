import { expect, type Page } from "@playwright/test";
import { gtinCheckDigit } from "../../../src/lib/barcode";
import { E2E_PASSWORD } from "./env";

/** Navigate and wait until the page is idle, i.e. hydrated and interactive. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function signIn(page: Page, email: string, locale: "en" | "ar" = "en"): Promise<void> {
  await page.goto(`/${locale}/login`);
  const form = page.getByTestId("login-form");
  const submit = form.locator("button[type=submit]");
  // The button is enabled once React has hydrated the form.
  await expect(submit).toBeEnabled();
  await form.locator("input[type=email]").fill(email);
  await form.locator("input[type=password]").fill(E2E_PASSWORD);
  await submit.click();
  await page.waitForURL(new RegExp(`/${locale}/admin`));
  await page.waitForLoadState("networkidle");
}

/** Short unique suffix so repeated runs never collide on SKUs or slugs. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
}

/**
 * A valid EAN-13 in GS1 prefix 952, which GS1 reserves for demonstrations and
 * examples — never a real product's GTIN.
 */
export function demoEan13(): string {
  const body = `952${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  return `${body}${gtinCheckDigit(body)}`;
}
