import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import nl from "../messages/nl.json";
import en from "../messages/en.json";

const db = new PrismaClient({ datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0" });
const password = "Saldova-welcome-local-123!";
const headers = { origin: "http://localhost:3100" };
test.use({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.41" } });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [email, plan] of [["switch-import@example.test", "PRO"], ["switch-other@example.test", "PRO"], ["switch-free@example.test", "FREE"]] as const) {
    await db.user.upsert({ where: { email }, update: {}, create: {
      email, passwordHash, hasCompletedOnboarding: true, completedTours: ["all"],
      company: { create: { name: "Local migration test", accountType: "ZZP" } },
      subscription: { create: { plan, status: "ACTIVE" } },
    } });
  }
});
test.afterAll(async () => db.$disconnect());
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(nl.auth.email, { exact: true }).fill(email);
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("new registration opens guided setup and retains the chosen plan", async ({ page }) => {
  await page.goto("/register?plan=pro");
  await page.getByLabel(nl.auth.email, { exact: true }).fill("welcome-new@example.test");
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: nl.auth.registerButton, exact: true }).click();
  await expect(page).toHaveURL(/\/start\?route=new&upgrade=pro/);
  await expect(page.getByRole("heading", { name: nl.setup.welcome.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Gekozen pakket bekijken/ })).toHaveAttribute("href", "/settings?upgrade=pro");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel(nl.setup.name).fill("Welkom Studio");
  await expect(page.getByRole("button", { name: nl.setup.save, exact: true })).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/welcome-setup-mobile.png", fullPage: true });
  await page.getByRole("button", { name: nl.setup.save, exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await page.getByLabel(nl.setup.welcome.customerName).fill("Eerste eigen klant");
  await page.getByLabel(nl.setup.welcome.customerEmail).fill("first@example.test");
  await page.getByRole("button", { name: nl.setup.welcome.saveCustomer }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("link", { name: /Conceptfactuur maken/ })).toBeVisible();
  await page.getByRole("link", { name: /Vorige stap/ }).click();
  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("switching previews customers, clears a failed selection and imports with review", async ({ page }) => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "switch-import@example.test" } });
  const other = await db.user.findUniqueOrThrow({ where: { email: "switch-other@example.test" } });
  await db.customer.create({ data: { userId: other.id, name: "Other account", email: "first@switch.test" } });
  await page.goto("/overstappen");
  await page.getByRole("link", { name: nl.migration.existing, exact: true }).click();
  await page.getByLabel(nl.auth.email, { exact: true }).fill(owner.email);
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page).toHaveURL(/\/start\?route=switch/);
  await page.goto("/start?route=switch&step=customer");
  const input = page.getByLabel(nl.customers.import.button, { exact: true });
  await expect(page.getByRole("button", { name: nl.customers.import.button, exact: true })).toBeEnabled();
  const csv = "Bedrijfsnaam;E-mailadres;Adres;Plaats\nEerste;first@switch.test;Dorpsstraat 1;Utrecht\nTweede;second@switch.test;;Gent\nDubbel;first@switch.test;;\nOngeldig;geen-email;;\n";
  const file = { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: nl.customers.import.button, exact: true }).click();
  await (await fileChooser).setFiles(file);
  const preview = page.getByRole("region", { name: nl.customers.import.title });
  await expect(preview).toContainText("Eerste");
  expect(await db.customer.count({ where: { userId: owner.id } })).toBe(0);
  await input.setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("Onbekend\nTest") });
  await expect(preview.getByRole("alert")).toHaveText(nl.customers.import.errorColumns);
  await expect(preview.getByRole("button", { name: /Importeer/ })).toHaveCount(0);
  await input.setInputFiles(file);
  await expect(preview.getByRole("button", { name: nl.customers.import.confirm.replace("{count}", "2") })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/switch-import-preview.png", fullPage: true });
  await preview.getByRole("button", { name: nl.customers.import.confirm.replace("{count}", "2") }).click();
  await expect(preview.getByRole("status")).toContainText(nl.customers.import.done.replace("{count}", "2"));
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  const stored = await db.customer.findFirstOrThrow({ where: { userId: owner.id, email: "first@switch.test" } });
  expect(stored.address).not.toBe("Dorpsstraat 1");
  const responses = await Promise.all([0, 1].map(() => page.request.post("/api/customers/import", { headers, data: { csv: "Naam;Email\nConcurrent;concurrent@switch.test", dryRun: false } })));
  for (const response of responses) expect(response.status()).toBe(200);
  expect((await Promise.all(responses.map((response) => response.json()))).map((value) => value.imported).sort()).toEqual([0, 1]);
  expect(await db.customer.count({ where: { userId: owner.id, email: "concurrent@switch.test" } })).toBe(1);
  expect(await db.customer.count({ where: { userId: other.id } })).toBe(1);
  await page.goto("/overstappen");
  await page.getByRole("link", { name: nl.migration.existing, exact: true }).click();
  await expect(page).toHaveURL(/\/start\?route=switch/);
});

test("import distinguishes plan capacity from duplicates and rejects excessive rows", async ({ page }) => {
  await login(page, "switch-free@example.test");
  const csv = "Naam;Email\nEen;een@limit.test\nTwee;twee@limit.test\nDrie;drie@limit.test\nVier;vier@limit.test\nEen dubbel;een@limit.test";
  const preview = await page.request.post("/api/customers/import", { headers, data: { csv, dryRun: true } });
  expect(await preview.json()).toMatchObject({ toImport: 3, overLimit: 1, duplicates: 1, imported: 0 });
  const results = await Promise.all([0, 1].map(() => page.request.post("/api/customers/import", { headers, data: { csv, dryRun: false } })));
  for (const result of results) expect(result.status()).toBe(200);
  const owner = await db.user.findUniqueOrThrow({ where: { email: "switch-free@example.test" } });
  expect(await db.customer.count({ where: { userId: owner.id } })).toBe(3);
  const oversized = "Naam\n" + Array.from({ length: 2001 }, (_, index) => `Customer ${index}`).join("\n");
  const rejected = await page.request.post("/api/customers/import", { headers, data: { csv: oversized, dryRun: false } });
  expect(rejected.status()).toBe(422);
  expect(await rejected.json()).toMatchObject({ error: "too_many_rows" });
  expect(await db.customer.count({ where: { userId: owner.id } })).toBe(3);
});

test("public switching route works on mobile and selects switching at signup", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overstappen");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nl.migration.title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const template = await page.request.get("/templates/klanten.csv");
  expect(template.status()).toBe(200);
  expect(await template.text()).toContain("Bedrijfsnaam;Voornaam");
  await page.getByRole("link", { name: /Begin je overstap/ }).click();
  await expect(page.getByRole("radio", { name: nl.auth.startRouteswitch, exact: true })).toBeChecked();
  await page.getByLabel(nl.auth.email, { exact: true }).fill("welcome-switch@example.test");
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: nl.auth.registerButton, exact: true }).click();
  await expect(page).toHaveURL(/\/start\?route=switch/);
  await expect(page.getByRole("heading", { name: nl.setup.welcome.switchTitle, exact: true })).toBeVisible();
  await page.goto("/en/overstappen");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.migration.title);
  const result = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
});
