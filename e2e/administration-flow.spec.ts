import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import bcrypt from "bcryptjs";
import nl from "../messages/nl.json";

const db = new PrismaClient({ datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0" });
const password = "Saldova-document-local-123!";
const headers = { origin: "http://localhost:3100" };
let ownerId: string, otherId: string, customerId: string;
test.use({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.31" } });
// These steps exercise one administration from setup through its quarter review.
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const email of ["setup-docs@example.test", "setup-other@example.test"]) {
    const user = await db.user.create({ data: { email, passwordHash, hasCompletedOnboarding: true, completedTours: ["all"], company: { create: { name: "", accountType: "ZZP" } }, subscription: { create: { plan: "PRO", status: "ACTIVE" } } } });
    if (email.includes("docs")) ownerId = user.id; else otherId = user.id;
  }
  await db.user.create({ data: { email: "setup-member@example.test", passwordHash, ownerId, teamRole: "MEMBER", hasCompletedOnboarding: true, completedTours: ["all"] } });
});
test.afterAll(async () => db.$disconnect());
async function login(page: Page, email = "setup-docs@example.test") {
  await page.goto("/login"); await page.getByLabel(nl.auth.email, { exact: true }).fill(email); await page.getByLabel(nl.auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click(); await expect(page).toHaveURL(/\/dashboard/);
}
async function pdf() { const doc = await PDFDocument.create(); doc.addPage().drawText("Local test receipt - no customer data"); return Buffer.from(await doc.save()); }

test("setup resumes from real saved records without requiring official details", async ({ page }) => {
  await login(page); await page.getByRole("link", { name: /Verder met instellen/ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await page.getByLabel(nl.setup.name).fill("Studio test"); await page.getByRole("button", { name: nl.setup.save }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  customerId = (await db.customer.create({ data: { userId: ownerId, name: "First local customer" } })).id;
  await db.invoice.create({ data: { userId: ownerId, customerId, invoiceNumber: "SETUP-DRAFT", status: "DRAFT", issueDate: new Date("2026-11-01"), subtotal: 100, vatAmount: 21, total: 121 } });
  await page.reload(); await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  await page.goto("/dashboard"); await expect(page.getByRole("link", { name: /Verder met instellen/ })).toHaveCount(0);
  expect((await db.company.findUniqueOrThrow({ where: { userId: ownerId } })).kvkNumber).toBeNull();
});

test("document UI uploads, processes and preserves the original", async ({ page }) => {
  await login(page); await page.goto("/expenses");
  const bytes = await pdf();
  await expect(page.getByLabel(nl.expenses.inbox.upload, { exact: true })).toBeEnabled();
  await expect(page.getByText(nl.expenses.inbox.emptyList, { exact: true })).toBeVisible();
  await page.getByLabel(nl.expenses.inbox.upload, { exact: true }).setInputFiles({ name: "local-receipt.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(page.getByText("local-receipt.pdf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: nl.expenses.inbox.process, exact: true }).click();
  await page.getByLabel(nl.expenses.fieldVendor).fill("Document test supplier");
  await page.getByLabel(nl.expenses.fieldAmount).fill("121");
  await page.getByRole("button", { name: nl.expenses.add, exact: true }).click();
  await expect(page.getByRole("cell", { name: "Document test supplier", exact: true })).toBeVisible();
  const item = await db.inboxItem.findFirstOrThrow({ where: { userId: ownerId } });
  expect(item.status).toBe("PROCESSED"); expect(item.expenseId).toBeTruthy();
  const download = await page.request.get(`/api/inbox/${item.id}/file`);
  expect(download.status()).toBe(200); expect(await download.body()).toEqual(bytes);
  expect(download.headers()["cache-control"]).toContain("no-store"); expect(download.headers()["content-disposition"]).toContain("attachment");
  await page.getByRole("button", { name: nl.expenses.inbox.statuses.PROCESSED, exact: true }).click();
  await expect(page.getByText("local-receipt.pdf", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("heading", { name: nl.expenses.title, exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/document-inbox-desktop.png", fullPage: true });
});

test("retries are idempotent and processed documents cannot be detached", async ({ page }) => {
  await login(page);
  const uploaded = await page.request.post("/api/inbox", { headers, multipart: { file: { name: "concurrent.pdf", mimeType: "application/pdf", buffer: await pdf() } } });
  expect(uploaded.status()).toBe(201); const { id } = await uploaded.json();
  const data = { inboxItemId: id, date: "2026-11-04", vendor: "Concurrent supplier", amountGross: 109, vatRate: 9 };
  const results = await Promise.all([page.request.post("/api/expenses", { headers, data }), page.request.post("/api/expenses", { headers, data })]);
  expect(results.map((r) => r.status()).sort()).toEqual([200,201]);
  const values = await Promise.all(results.map((r) => r.json())); expect(values[0].id).toBe(values[1].id);
  expect(await db.expense.count({ where: { userId: ownerId, vendor: "Concurrent supplier" } })).toBe(1);
  expect(await db.auditLog.count({ where: { accountId: ownerId, target: values[0].id, action: "expense.created" } })).toBe(1);
  expect((await page.request.patch(`/api/inbox/${id}`, { headers, data: { status: "NEW" } })).status()).toBe(409);
  expect((await page.request.delete(`/api/inbox/${id}`, { headers })).status()).toBe(409);
  expect((await page.request.delete(`/api/expenses/${values[0].id}`, { headers })).status()).toBe(200);
  const restored = await db.inboxItem.findUniqueOrThrow({ where: { id } }); expect(restored.status).toBe("NEW"); expect(restored.expenseId).toBeNull();
  await page.goto("/expenses"); await page.getByRole("button", { name: nl.expenses.inbox.dismiss, exact: true }).click();
  await page.getByRole("button", { name: nl.expenses.inbox.statuses.DISMISSED, exact: true }).click();
  await page.getByRole("button", { name: nl.expenses.inbox.restore, exact: true }).click();
  await expect.poll(async () => (await db.inboxItem.findUniqueOrThrow({ where: { id } })).status).toBe("NEW");
});

test("quarter review separates currencies and counts actionable records", async ({ page }) => {
  for (const [invoiceNumber, currency, subtotal, vatAmount] of [["REVIEW-EUR", "EUR", 100, 9], ["REVIEW-USD", "USD", 999, 99]] as const) await db.invoice.create({ data: { userId: ownerId, customerId, invoiceNumber, currency, status: "SENT", issueDate: new Date("2026-11-01"), subtotal, vatAmount, total: subtotal + vatAmount } });
  await db.expense.create({ data: { userId: ownerId, date: new Date("2026-11-01"), vendor: "Missing receipt", amountGross: 10, vatAmount: 0 } });
  await db.bankTransaction.create({ data: { userId: ownerId, date: new Date("2026-11-01"), amount: 100, direction: "CREDIT", description: "Unmatched test", dedupeHash: "quarter-test" } });
  await login(page); await page.goto("/btw?y=2026&q=4");
  await expect(page.getByRole("heading", { name: nl.vat.title, exact: true })).toBeVisible();
  for (const key of ["drafts", "unmatched", "pending", "missing", "foreign"]) await expect(page.getByTestId(`quarter-${key}`)).toContainText("1 →");
  await expect(page.locator('[data-tour="vat-boxes"]')).toContainText("100,00");
  await expect(page.locator('[data-tour="vat-boxes"]')).not.toContainText("999,00");
  await expect(page.locator('[data-tour="vat-boxes"]')).not.toContainText("1a");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId("quarter-checks")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/quarter-review-mobile.png", fullPage: true });
  await page.goto("/btw?y=Infinity&q=2.5"); await expect(page.getByTestId("quarter-checks")).toBeVisible();
});

test("documents enforce tenant access, permissions and file type", async ({ page }) => {
  const item = await db.inboxItem.findFirstOrThrow({ where: { userId: ownerId } });
  await login(page, "setup-other@example.test");
  for (const suffix of ["", "/file"]) expect((await page.request.get(`/api/inbox/${item.id}${suffix}`)).status()).toBe(404);
  expect((await page.request.post("/api/expenses", { headers, data: { inboxItemId: item.id, date: "2026-11-04", vendor: "Other tenant", amountGross: 121, vatRate: 21 } })).status()).toBe(404);
  expect(await db.expense.count({ where: { userId: otherId } })).toBe(0);
  expect((await page.request.post("/api/inbox", { headers, multipart: { file: { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<svg/>") } } })).status()).toBe(422);
  await page.context().clearCookies(); await login(page, "setup-member@example.test");
  expect((await page.request.get(`/api/inbox/${item.id}/file`)).status()).toBe(403);
  await page.goto("/start"); await expect(page).toHaveURL(/\/dashboard/);
});
