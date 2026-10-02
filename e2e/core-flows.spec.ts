import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import nl from "../messages/nl.json";
import { createInvoiceAccessToken } from "../lib/invoice-access";

// Literal loopback test database; deliberately never read an environment URL.
const db = new PrismaClient({ datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0" });
const password = "Saldova-local-test-123!";
let ownerId: string, otherId: string, customerId: string, otherCustomerId: string, accountantId: string;

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const createOwner = (email: string) => db.user.upsert({ where: { email }, update: {}, create: {
    email, passwordHash, hasCompletedOnboarding: true, completedTours: ["all"],
    company: { create: { name: "Testbedrijf", accountType: "ZZP" } },
    subscription: { create: { plan: "PRO", status: "ACTIVE" } },
  } });
  const owner = await createOwner("owner-a@example.test"); ownerId = owner.id;
  const other = await createOwner("owner-b@example.test"); otherId = other.id;
  customerId = (await db.customer.create({ data: { userId: ownerId, name: "Klant A", email: "customer-a@example.test" } })).id;
  otherCustomerId = (await db.customer.create({ data: { userId: otherId, name: "Vertrouwelijke klant B" } })).id;
  accountantId = (await db.user.upsert({ where: { email: "accountant@example.test" }, update: { permissionsCustom: false, permissions: [] }, create: {
    email: "accountant@example.test", passwordHash, ownerId, teamRole: "ACCOUNTANT",
    hasCompletedOnboarding: true, completedTours: ["all"],
  } })).id;
});
test.afterAll(async () => db.$disconnect());

async function login(page: Page, email = "owner-a@example.test") {
  await page.goto("/login");
  await page.getByLabel(nl.auth.email, { exact: true }).fill(email);
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

function invoiceData(customer = customerId, hours: string[] = []) {
  return { customerId: customer, lineItems: [{ description: "Werkzaamheden", quantity: 1, unitPrice: 100, vatRate: 21 }], timeEntryIds: hours };
}

test("new account can register, save tour progress and add a customer", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(nl.auth.email, { exact: true }).fill("new-user@example.test");
  await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: nl.auth.registerButton, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect((await page.request.post("/api/user/onboarding", { data: { completed: true } })).ok()).toBe(true);
  expect((await page.request.post("/api/user/onboarding", { data: { tour: "all" } })).ok()).toBe(true);
  await page.goto("/customers");
  await page.getByRole("button", { name: new RegExp(nl.customers.new) }).first().click();
  await page.getByLabel(nl.customers.name, { exact: true }).fill("Mijn eerste klant");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/customers") && r.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await created).status()).toBe(201);
  await expect(page.getByText("Mijn eerste klant", { exact: true }).first()).toBeVisible();
  const user = await db.user.findUnique({ where: { email: "new-user@example.test" } });
  expect(user?.hasCompletedOnboarding).toBe(true);
});

test("invoice form, PDF and last send review work; missing email service does not mark SENT", async ({ page, request }) => {
  await login(page);
  await page.goto("/invoices/new");
  await page.getByRole("textbox", { name: nl.invoices.description + " 1", exact: true }).fill("Website onderhouden");
  await page.getByRole("spinbutton", { name: nl.invoices.unitPrice + " 1", exact: true }).fill("100");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/invoices") && r.request().method() === "POST");
  await page.getByRole("button", { name: nl.invoices.create, exact: true }).click();
  const response = await created; expect(response.status()).toBe(201);
  // The form navigates as soon as the response headers arrive. Read the saved
  // result after that visible navigation instead of racing a discarded body.
  await expect(page).toHaveURL(/\/invoices$/);
  const invoice = await db.invoice.findFirstOrThrow({ where: { userId: ownerId, lineItems: { some: { description: "Website onderhouden" } } } });
  expect(Number(invoice.total)).toBe(121);
  await page.goto("/invoices/" + invoice.id);
  const pdf = await page.request.get("/api/invoices/" + invoice.id + "/pdf");
  expect(pdf.ok()).toBe(true); expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect((await request.get("/api/invoices/" + invoice.id + "/pdf")).status()).toBe(401);
  process.env.AUTH_SECRET = "saldova-local-e2e-only-not-a-production-secret-123456789";
  const token = createInvoiceAccessToken(invoice.id, ownerId);
  expect((await request.get("/api/invoices/" + invoice.id + "/pdf?token=" + token)).status()).toBe(200);
  expect((await request.get("/api/invoices/wrong-id/pdf?token=" + token)).status()).toBe(403);
  await page.getByRole("button", { name: nl.invoices.sendInvoice, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText("customer-a@example.test");
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: nl.invoices.sendInvoice, exact: true })).toBeFocused();
  await page.getByRole("button", { name: nl.invoices.sendInvoice, exact: true }).click();
  await dialog.getByRole("button", { name: nl.invoices.sendReview.confirm }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect((await db.invoice.findUnique({ where: { id: invoice.id } }))?.status).toBe("DRAFT");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: "test-results/invoice-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("tenant boundaries, approved hours and rollback use the actual database", async ({ page }) => {
  await login(page);
  expect((await page.request.post("/api/invoices", { data: invoiceData(otherCustomerId) })).status()).toBe(404);
  const pending = await db.timeEntry.create({ data: { userId: ownerId, createdById: ownerId, customerId, description: "Nog beoordelen", hours: 1, approval: "PENDING" } });
  const before = await db.invoice.count({ where: { userId: ownerId } });
  expect((await page.request.post("/api/invoices", { data: invoiceData(customerId, [pending.id]) })).status()).toBe(409);
  expect(await db.invoice.count({ where: { userId: ownerId } })).toBe(before);
  expect((await page.request.patch("/api/time-entries/" + pending.id, { data: { customerId: otherCustomerId } })).status()).toBe(404);
  await db.timeEntry.update({ where: { id: pending.id }, data: { approval: "APPROVED" } });
  expect((await page.request.post("/api/invoices", { data: invoiceData(customerId, [pending.id]) })).status()).toBe(201);
  expect((await page.request.post("/api/invoices", { data: invoiceData(customerId, [pending.id]) })).status()).toBe(409);
  expect((await db.timeEntry.findUnique({ where: { id: pending.id } }))?.status).toBe("BILLED");
  const linked = await db.timeEntry.findUniqueOrThrow({ where: { id: pending.id } });
  expect((await page.request.delete("/api/invoices/" + linked.invoiceId)).status()).toBe(200);
  expect((await db.timeEntry.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("OPEN");
  const otherInvoice = await db.invoice.create({ data: { userId: otherId, customerId: otherCustomerId, invoiceNumber: "OTHER-1", subtotal: 100, vatAmount: 21, total: 121 } });
  expect((await page.request.get("/api/invoices/" + otherInvoice.id)).status()).toBe(404);
  expect((await page.request.patch("/api/invoices/" + otherInvoice.id, { data: { status: "PAID" } })).status()).toBe(404);
});

test("CSV import deduplicates and incorrect matches cannot settle an invoice", async ({ page }) => {
  await login(page);
  const invoice = await (await page.request.post("/api/invoices", { data: invoiceData() })).json();
  await page.request.patch("/api/invoices/" + invoice.id, { data: { status: "SENT" } });
  const transactions = [{ date: "2026-09-05", amount: 1, direction: "CREDIT", description: "Te weinig ontvangen" }];
  const imported = await page.request.post("/api/bank/import", { data: { transactions } });
  expect((await imported.json()).imported).toBe(1);
  const again = await page.request.post("/api/bank/import", { data: { transactions } });
  expect((await again.json()).duplicates).toBe(1);
  const transaction = await db.bankTransaction.findFirstOrThrow({ where: { userId: ownerId, description: transactions[0].description } });
  expect((await page.request.patch("/api/bank/transactions/" + transaction.id, { data: { action: "confirm", invoiceId: invoice.id } })).status()).toBe(422);
  expect((await db.invoice.findUnique({ where: { id: invoice.id } }))?.status).toBe("SENT");
  const correct = await db.bankTransaction.create({ data: { userId: ownerId, date: new Date(), amount: 121, direction: "CREDIT", description: "Volledig betaald", dedupeHash: "correct-payment" } });
  expect((await page.request.patch("/api/bank/transactions/" + correct.id, { data: { action: "confirm", invoiceId: invoice.id } })).status()).toBe(200);
  expect((await page.request.patch("/api/bank/transactions/" + correct.id, { data: { action: "confirm", invoiceId: invoice.id } })).status()).toBe(200);
  expect((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
  expect((await page.request.delete("/api/invoices/" + invoice.id)).status()).toBe(409);
  expect((await page.request.patch("/api/invoices/" + invoice.id, { data: { status: "DRAFT" } })).status()).toBe(409);
});

test("quote conversion is repeatable and a failed recurring email leaves one recoverable draft", async ({ page }) => {
  await login(page);
  const quote = await db.quote.create({ data: {
    userId: ownerId, customerId, quoteNumber: "OFFERTE-1", publicToken: "local-test-quote-token", status: "ACCEPTED",
    subtotal: 100, vatAmount: 21, total: 121,
    lineItems: { create: { description: "Offertewerk", quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 } },
  } });
  const first = await page.request.post("/api/quotes/" + quote.id + "/convert"); expect(first.status()).toBe(201);
  const second = await page.request.post("/api/quotes/" + quote.id + "/convert"); expect(second.status()).toBe(200);
  expect((await first.json()).invoiceId).toBe((await second.json()).invoiceId);
  const recurring = await db.recurringInvoice.create({ data: {
    userId: ownerId, customerId, nextRunAt: new Date("2026-01-01"), autoSend: true,
    lineItems: invoiceData().lineItems,
  } });
  const run = await page.request.post("/api/recurring/" + recurring.id + "/run");
  expect(run.status()).toBe(201); const result = await run.json(); expect(result.emailed).toBe(false);
  expect((await db.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } })).status).toBe("DRAFT");
  const advanced = await db.recurringInvoice.findUniqueOrThrow({ where: { id: recurring.id } });
  expect(advanced.runCount).toBe(1); expect(advanced.nextRunAt > new Date()).toBe(true);
  expect(await db.auditLog.count({ where: { accountId: ownerId, action: "invoice.recurring_created", target: result.invoiceNumber } })).toBe(1);
});

test("accountant cannot manage subscriptions or export staff data; revoked rights take effect immediately", async ({ page }) => {
  await login(page, "accountant@example.test");
  expect((await page.request.get("/api/invoices")).status()).toBe(200);
  expect((await page.request.post("/api/billing/checkout", { data: { plan: "PRO" } })).status()).toBe(403);
  expect((await page.request.post("/api/billing/cancel")).status()).toBe(403);
  expect((await page.request.get("/api/account/export")).status()).toBe(403);
  await db.user.update({ where: { id: accountantId }, data: { permissionsCustom: true, permissions: [] } });
  expect((await page.request.get("/api/invoices")).status()).toBe(403);
});

test("cross-origin writes are rejected and login controls are accessible", async ({ page }) => {
  await login(page);
  expect((await page.request.post("/api/invoices", { data: invoiceData(), headers: { origin: "https://attacker.example" } })).status()).toBe(403);
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("cron failures leave reminders unsent and never recreate a recurring invoice", async ({ page }) => {
  await login(page);
  const overdue = await db.invoice.create({ data: { userId: ownerId, customerId, invoiceNumber: "CRON-1", subtotal: 100, vatAmount: 21, total: 121, status: "OVERDUE", dueDate: new Date("2026-01-01") } });
  await db.recurringInvoice.create({ data: { userId: ownerId, customerId, nextRunAt: new Date("2026-01-01"), autoSend: true, lineItems: invoiceData().lineItems } });
  const headers = { authorization: "Bearer local-e2e-cron-disabled" };
  const first = await page.request.get("/api/cron/send-reminders", { headers });
  expect(first.status()).toBe(200); const firstRun = await first.json();
  expect(firstRun.failed).toBeGreaterThan(0); expect(firstRun.recurring.created).toBe(1);
  expect(firstRun.recurring.failed).toBe(1); expect(firstRun.sent).toBe(0);
  const count = await db.invoice.count({ where: { userId: ownerId } });
  const second = await page.request.get("/api/cron/send-reminders", { headers });
  expect((await second.json()).recurring.created).toBe(0);
  expect(await db.invoice.count({ where: { userId: ownerId } })).toBe(count);
  expect((await db.invoice.findUniqueOrThrow({ where: { id: overdue.id } })).reminderCount).toBe(0);
});

test("owner export excludes secrets and a password change revokes the existing session", async ({ page }) => {
  await login(page);
  const response = await page.request.get("/api/account/export"); expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const data = await response.text(); expect(data).not.toContain("passwordHash"); expect(data).not.toContain("totpSecret"); expect(data).not.toContain(otherCustomerId);
  await db.user.update({ where: { id: ownerId }, data: { passwordHash: await bcrypt.hash(password + "-changed", 12) } });
  expect((await page.request.get("/api/invoices")).status()).toBe(401);
});
