import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import nl from "../messages/nl.json";

// Literal loopback test database; deliberately never read an environment URL.
const db = new PrismaClient({ datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0" });
const password = "Saldova-local-test-123!";

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const owner = (email: string, plan: "WEBSHOP" | "PRO") => db.user.upsert({ where: { email }, update: {}, create: {
    email, passwordHash, hasCompletedOnboarding: true, completedTours: ["all"],
    company: { create: { name: "Webshop BV", accountType: "ZZP" } },
    subscription: { create: { plan, status: "ACTIVE" } },
  } });
  await owner("shop-a@example.test", "WEBSHOP");
  await owner("shop-b@example.test", "WEBSHOP");
  await owner("pro-c@example.test", "PRO");
});
test.afterAll(async () => db.$disconnect());

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(nl.auth.email, { exact: true }).fill(email);
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const year = new Date().getFullYear();
const CSV = [
  "Name,Financial Status,Currency,Taxes,Total,Created at,Shipping Country",
  `#1,paid,EUR,1900.00,11900.00,${year}-01-15 10:00:00 +0100,DE`,
  `#2,paid,EUR,21.00,121.00,${year}-01-16 10:00:00 +0100,NL`,
  `#3,paid,EUR,210.00,1210.00,${year}-01-17 10:00:00 +0100,BE`,
  `#4,refunded,EUR,19.00,119.00,${year}-01-18 10:00:00 +0100,DE`,
  `#5,pending,EUR,1.00,10.00,${year}-01-18 10:00:00 +0100,NL`,
].join("\n");

test("webshop owner imports a CSV, sees OSS per country and duplicates are skipped", async ({ page }) => {
  await login(page, "shop-a@example.test");
  await page.goto("/webshop");
  await page.getByRole("button", { name: /Q1/ }).click();
  await page.getByRole("button", { name: new RegExp(nl.webshop.add) }).click();
  await page.getByRole("button", { name: new RegExp(nl.webshop.connect.csvTitle) }).click();
  await page.getByLabel(nl.webshop.connect.sourceLabel).fill("Shopify-export");
  await page.locator('input[type="file"]').setInputFiles({ name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await expect(page.getByText("4 bestellingen gevonden")).toBeVisible();
  const imported = page.waitForResponse((r) => r.url().endsWith("/api/webshop/import"));
  await page.getByRole("button", { name: nl.webshop.connect.importCta, exact: true }).click();
  expect((await imported).status()).toBe(200);
  await expect(page.getByText("4 bestellingen geïmporteerd (0 stonden er al).")).toBeVisible();

  // OSS: DE 10.000 − 100 retour = 9.900, BE 1.000 → samen 10.900: boven de drempel.
  await expect(page.getByText(nl.webshop.oss.over, { exact: true })).toBeVisible();
  await expect(page.getByText("€ 10.900,00")).toBeVisible();
  const row = page.locator("tr", { has: page.getByRole("cell", { name: "DE", exact: true }) });
  await expect(row).toContainText("9.900");
  await expect(page.locator("tr", { has: page.getByRole("cell", { name: "BE", exact: true }) })).toContainText("1.000");
  await page.screenshot({ path: "test-results/webshop-page.png", fullPage: true });

  // Zelfde bestand nog een keer: niets dubbel.
  const again = await page.request.post("/api/webshop/import", { data: { source: "Shopify-export", orders: [
    { externalId: "csv-shopify-export:#1", orderNumber: "#1", kind: "SALE", orderDate: `${year}-01-15`, country: "DE", currency: "EUR", totalGross: 11900, vatAmount: 1900, shippingGross: 0, fees: 0, isBusiness: false },
  ] } });
  expect(await again.json()).toMatchObject({ imported: 0, duplicates: 1 });

  // Sleutels/credentials komen nooit mee in de lijst.
  const list = await (await page.request.get("/api/webshop/connections")).json();
  expect(JSON.stringify(list)).not.toContain("credentials");
});

test("another account never sees someone else's webshop orders", async ({ page }) => {
  await login(page, "shop-b@example.test");
  const overview = await (await page.request.get(`/api/webshop/overview?year=${year}&quarter=0`)).json();
  expect(overview.totals.orders).toBe(0);
  expect(await (await page.request.get("/api/webshop/connections")).json()).toEqual([]);
});

test("Pro plan cannot connect; unsafe shop addresses are refused", async ({ page }) => {
  await login(page, "pro-c@example.test");
  const denied = await page.request.post("/api/webshop/import", { data: { source: "x", orders: [] } });
  expect(denied.status()).toBe(403);
  await page.goto("/webshop");
  await expect(page.getByText(nl.webshop.upsellTitle)).toBeVisible();

  await page.context().clearCookies();
  await login(page, "shop-b@example.test");
  for (const shopUrl of ["https://127.0.0.1", "https://localhost", "http://example.com", "https://169.254.169.254"]) {
    const res = await page.request.post("/api/webshop/connections", { data: { platform: "WOOCOMMERCE", shopUrl, consumerKey: "ck_12345678", consumerSecret: "cs_12345678" } });
    expect(res.status(), shopUrl).toBe(422);
  }
  const shopify = await page.request.post("/api/webshop/connections", { data: { platform: "SHOPIFY", shopUrl: "evil.example.com", accessToken: "shpat_12345678" } });
  expect(shopify.status()).toBe(422);
});
