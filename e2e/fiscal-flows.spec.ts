import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import nl from "../messages/nl.json";
import en from "../messages/en.json";

// Only the isolated loopback database started by Playwright, never production.
const db = new PrismaClient({ datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0" });
const password = "Saldova-fiscal-local-test-123!";

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [name, legalForm, korEnabled] of [
    ["fiscal", "EENMANSZAAK", false], ["fiscal-kor", "EENMANSZAAK", true], ["fiscal-bv", "BV", false],
  ] as const) {
    await db.user.upsert({ where: { email: `${name}@example.test` }, update: {}, create: {
      email: `${name}@example.test`, passwordHash, hasCompletedOnboarding: true, completedTours: ["all"],
      company: { create: { name: "Fiscale test", accountType: legalForm === "BV" ? "BEDRIJF" : "ZZP", legalForm } },
      subscription: { create: { plan: legalForm === "BV" ? "BUSINESS" : "PRO", status: "ACTIVE" } },
      invoiceSettings: { create: { korEnabled } },
    } });
  }
  const owner = await db.user.findUniqueOrThrow({ where: { email: "fiscal@example.test" } });
  await db.user.upsert({ where: { email: "fiscal-member@example.test" }, update: {}, create: {
    email: "fiscal-member@example.test", passwordHash, ownerId: owner.id, teamRole: "MEMBER",
    hasCompletedOnboarding: true, completedTours: ["all"],
  } });
});
test.afterAll(async () => db.$disconnect());

async function login(page: Page, name = "fiscal") {
  await page.goto("/login");
  await page.getByLabel(nl.auth.email, { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/fiscale-rust");
}

test("year-specific reserves reconcile and do not reuse the full annual cap each month", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await login(page);
  const f = nl.fiscaleRust;
  await page.getByLabel(f.manualLabel, { exact: true }).fill("12100");
  await page.getByLabel(f.costsLabel, { exact: true }).fill("2000");
  await page.getByLabel(f.inputVatLabel, { exact: true }).fill("180");
  await page.getByRole("button", { name: f.calc, exact: true }).click();
  await expect(page.getByTestId("fiscal-total-buffer")).toContainText("5.178,80");
  await expect(page.getByTestId("fiscal-remaining")).toContainText("4.741,20");
  await page.getByLabel(f.yearLabel).selectOption("2025");
  await expect(page.getByTestId("fiscal-zvw")).toContainText("420,80");
  await expect(page.getByTestId("fiscal-total-buffer")).toContainText("5.214,88");
  await page.getByLabel(f.yearLabel).selectOption("2026");
  await page.getByLabel(f.periodLabel).selectOption("month");
  await expect(page.getByTestId("fiscal-zvw")).toContainText("320,95");
  await expect(page.getByTestId("fiscal-total-buffer")).toContainText("5.105,05");
  await page.getByLabel(f.costsLabel, { exact: true }).fill("1x");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("fiscal-total-buffer")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("CSV remains a local preview until selected receipts are applied, excluding other years", async ({ page }) => {
  await login(page);
  const f = nl.fiscaleRust;
  const financialWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/(bank|invoices|expenses)/.test(request.url())) financialWrites.push(request.url());
  });
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: f.chooseFile }).click();
  await (await fileChooser).setFiles({ name: "ontvangsten.csv", mimeType: "text/csv", buffer: Buffer.from(
    "Datum;Omschrijving;Bedrag (EUR);Af Bij\r\n2026-09-01;Klant factuur 1;12100,00;Bij\r\n2026-09-02;Lening;8000,00;Bij\r\n2025-12-30;Oud jaar;1000,00;Bij\r\n2026-09-03;Kosten;40,00;Af",
  ) });
  await expect(page.getByRole("button", { name: f.csvApply })).toBeDisabled();
  await expect(page.getByTestId("fiscal-total-buffer")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Oud jaar/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Klant factuur 1/ }).check();
  await expect(page.getByRole("checkbox", { name: /Lening/ })).not.toBeChecked();
  await page.getByRole("button", { name: f.csvApply }).click();
  await expect(page.getByTestId("fiscal-total-buffer")).toContainText("6.143,50");
  await page.getByRole("checkbox", { name: /Klant factuur 1/ }).uncheck();
  await expect(page.getByTestId("fiscal-total-buffer")).toHaveCount(0);
  expect(financialWrites).toEqual([]);
});

test("KOR uses costs including VAT and never deducts input VAT", async ({ page }) => {
  await login(page, "fiscal-kor");
  const f = nl.fiscaleRust;
  await expect(page.getByLabel(f.inputVatLabel, { exact: true })).toHaveCount(0);
  await page.getByLabel(f.manualLabelKor, { exact: true }).fill("12100");
  await page.getByLabel(f.costsLabelKor, { exact: true }).fill("2420");
  await page.getByRole("button", { name: f.calc, exact: true }).click();
  await expect(page.getByTestId("fiscal-btw")).toHaveCount(0);
  await expect(page.getByTestId("fiscal-total-buffer")).toContainText("3.710,83");
  await page.getByLabel(f.manualLabelKor, { exact: true }).fill("20001");
  await page.getByRole("button", { name: f.calc, exact: true }).click();
  await expect(page.getByTestId("fiscal-kor-warning")).toBeVisible();
  await expect(page.getByTestId("fiscal-total-buffer")).toHaveCount(0);
});

test("BV shows progressive corporate tax, omits personal Zvw and renders English", async ({ page }) => {
  await login(page, "fiscal-bv");
  await page.goto("/en/fiscale-rust");
  const f = en.fiscaleRust;
  await page.getByLabel(f.manualLabel, { exact: true }).fill("363000");
  await page.getByRole("button", { name: f.calc, exact: true }).click();
  await expect(page.getByTestId("fiscal-vpb")).toContainText("63,800.00");
  await expect(page.getByTestId("fiscal-zvw")).toHaveCount(0);
  await expect(page.getByTestId("fiscal-total-buffer")).toContainText("139,480.00");
  await expect(page.locator("main")).not.toContainText("fiscaleRust.");
});

test("fiscal inputs and results work at 360px and pass scoped accessibility checks", async ({ page }) => {
  await login(page);
  const f = nl.fiscaleRust;
  await page.getByLabel(f.manualLabel, { exact: true }).fill("12100");
  await page.getByRole("button", { name: f.calc, exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "test-results/fiscal-mobile.png", fullPage: true });
  const a11y = await new AxeBuilder({ page }).include('main').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(a11y.violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("fiscal-ib").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("fiscal-ib")).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: "test-results/fiscal-desktop-results.png" });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "test-results/fiscal-desktop.png" });
});

test("a team member without financial permissions is redirected before the calculator", async ({ page }) => {
  await login(page, "fiscal-member");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("fiscal-total-buffer")).toHaveCount(0);
});
