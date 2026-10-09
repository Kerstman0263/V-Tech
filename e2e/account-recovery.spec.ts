import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import nl from "../messages/nl.json";

// Literal loopback test database; deliberately never read an environment URL.
const db = new PrismaClient({ datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0" });
const email = "recovery@example.test";
let userId: string;

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash("Oud-wachtwoord-123", 12);
  userId = (await db.user.upsert({ where: { email }, update: { passwordHash }, create: {
    email, passwordHash, hasCompletedOnboarding: true, completedTours: ["all"],
    company: { create: { name: "Herstel BV", accountType: "ZZP" } },
    subscription: { create: { plan: "FREE", status: "TRIALING" } },
  } })).id;
});
test.afterAll(async () => db.$disconnect());

test("login links to password recovery, which is honest about a missing mail service", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: nl.auth.forgotLink }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
  await page.getByLabel(nl.auth.reset.email, { exact: true }).fill(email);
  await page.getByRole("button", { name: nl.auth.reset.sendButton }).click();
  await expect(page.getByRole("status")).toHaveText(nl.auth.reset.noEmail);
  expect(await db.authToken.count({ where: { userId } })).toBe(0);
});

test("a reset link sets a new password once and the old password stops working", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  await db.authToken.create({ data: { userId, type: "PASSWORD_RESET", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });

  const response = await page.goto(`/reset-password?token=${token}`);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await page.getByLabel(nl.auth.reset.newPassword, { exact: true }).fill("Nieuw-wachtwoord-456");
  await page.getByLabel(nl.auth.reset.confirmPassword, { exact: true }).fill("Nieuw-wachtwoord-456");
  await page.getByRole("button", { name: nl.auth.reset.saveButton }).click();
  await expect(page.getByRole("status")).toHaveText(nl.auth.reset.done);

  await page.goto(`/reset-password?token=${token}`);
  await expect(page.getByText(nl.auth.reset.expired, { exact: true })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel(nl.auth.email, { exact: true }).fill(email);
  await page.getByLabel(nl.auth.password, { exact: true }).fill("Oud-wachtwoord-123");
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page.getByText(nl.auth.invalidCredentials, { exact: true })).toBeVisible();
  await page.getByLabel(nl.auth.password, { exact: true }).fill("Nieuw-wachtwoord-456");
  await page.getByRole("button", { name: nl.auth.loginButton, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("an invalid verification link explains itself on the login page", async ({ page }) => {
  await page.goto("/api/auth/verify-email?token=ongeldig");
  await expect(page).toHaveURL(/\/login\?verify=invalid/);
  await expect(page.getByText(nl.auth.verifyInvalid, { exact: true })).toBeVisible();
});
