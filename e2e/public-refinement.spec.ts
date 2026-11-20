import nl from "../messages/nl.json";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public pages keep a clear mobile layout and offer supported monthly billing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nl.home.titleA);
  await page.screenshot({ path: "test-results/public-desktop.png" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: "test-results/public-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/zzp#pricing");
  await expect(page.locator("#pricing").getByText(nl.pricing.perMonthExcl, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Jaarlijks", exact: true })).toHaveCount(0);
});

test("product journey carries edited hours through invoice and reserve without saving data", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await page.goto("/");
  await page.getByRole("link", { name: "Ontdek hoe het werkt", exact: true }).click();
  await page.getByRole("slider", { name: "Gewerkte uren" }).press("Home");
  await page.getByRole("slider", { name: "Gewerkte uren" }).press("ArrowRight");
  await page.getByRole("button", { name: "Volgende stap", exact: true }).click();
  await expect(page.getByTestId("journey-invoice-total")).toContainText("181,50");
  await page.getByRole("tab", { name: /Maak het concreet/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("journey-reserve")).toContainText("30,72");
  await expect(page.getByRole("tab", { name: /Kijk vooruit/ })).toBeFocused();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("tabpanel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/journey-mobile.png" });
  const result = await new AxeBuilder({ page }).include('.journey-section').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("heading", { name: "Je werk verdient een helder vervolg." }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/journey-desktop.png" });
});

test("English example remains usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Good work deserves a clear next step." })).toBeVisible();
  await page.getByRole("tab", { name: /Make it tangible/ }).click();
  await expect(page.getByTestId("journey-invoice-total")).toContainText("1,452.00");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByTestId("journey-reserve")).toContainText("675.79");
});
