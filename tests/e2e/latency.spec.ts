import { test, expect } from "@playwright/test";
import { resetSeed, login } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("sending while the provider takes 5s never blocks the conversation", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill("[[delay:5000]] a genuinely interesting observation");
  const sentAt = Date.now();
  await page.getByRole("button", { name: "Send message" }).click();

  // Optimistic row appears effectively immediately — the 5s provider call is not on the send path.
  const row = page.getByTestId("message-row").filter({ hasText: "a genuinely interesting observation" });
  await expect(row).toBeVisible({ timeout: 1500 });
  expect(Date.now() - sentAt).toBeLessThan(2500);
  await expect(composer).toHaveValue(""); // input cleared instantly

  // Reaction placeholder is visible while the provider is busy
  await expect(page.getByLabel("Analysis pending").last()).toBeVisible();

  // And the reaction arrives once analysis completes (poll-driven)
  await expect(row.getByRole("button", { name: /Great/ })).toBeVisible({ timeout: 12000 });
});

test("a failing provider never loses the message", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  await page.getByRole("textbox", { name: "Message" }).fill("[[fail:500]] important decision please");
  await page.getByRole("button", { name: "Send message" }).click();

  // Message persists and is visible even though classification fails
  const row = page.getByTestId("message-row").filter({ hasText: "important decision please" });
  await expect(row).toBeVisible({ timeout: 2000 });
  const content = await row.getByText("important decision please").innerText();
  expect(content).toContain("important decision please");

  // While the job retries, the UI shows an analysis-in-progress affordance rather than nothing
  await expect(
    page.getByLabel("Analysis pending").last()
  ).toBeVisible();
});

test("sending several messages rapidly keeps all of them visible", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  const composer = page.getByRole("textbox", { name: "Message" });
  for (const text of ["first distinct message", "second distinct message", "third distinct message"]) {
    await composer.fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
  }

  const list = page.getByTestId("message-list");
  await expect(list.getByText("first distinct message")).toBeVisible();
  await expect(list.getByText("second distinct message")).toBeVisible();
  await expect(list.getByText("third distinct message")).toBeVisible();
});

test("reloading mid-analysis keeps the message and completes the reaction", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  await page.getByRole("textbox", { name: "Message" }).fill("[[delay:3000]] reload during analysis");
  // Wait for the POST to actually complete — otherwise the reload aborts it mid-flight.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/messages"),
      { timeout: 10_000 }
    ),
    page.getByRole("button", { name: "Send message" }).click(),
  ]);
  expect(response.status()).toBe(201);
  await expect(page.getByTestId("message-list").getByText("reload during analysis")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();
  const row = page.getByTestId("message-row").filter({ hasText: "reload during analysis" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: /Excellent/ })).toBeVisible({ timeout: 10_000 });
});

test("the other participant sees the message and reaction without a reload", async ({ page, browser }) => {
  const timurContext = await browser.newContext();
  const timurPage = await timurContext.newPage();
  await login(timurPage, "timur@chesschat.dev");
  await timurPage.getByRole("button", { name: /Aisha Bekova/ }).first().click();

  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();
  await page.getByRole("textbox", { name: "Message" }).fill("[[delay:1500]] hello from aisha");
  await page.getByRole("button", { name: "Send message" }).click();

  // Timur receives the message through the poll cycle — no manual refresh.
  await expect(timurPage.getByTestId("message-list").getByText("hello from aisha")).toBeVisible({
    timeout: 5000,
  });
  await expect(
    timurPage.getByTestId("message-row").filter({ hasText: "hello from aisha" }).getByRole("button", { name: /Excellent/ })
  ).toBeVisible({ timeout: 10_000 });

  await timurContext.close();
});
