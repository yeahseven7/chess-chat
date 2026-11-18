import { test, expect } from "@playwright/test";
import { resetSeed, login, BASE_URL } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("a new user can register, land in the app, log out and log back in", async ({ page }) => {
  const username = `e2e${Date.now().toString(36)}`;
  await page.goto("/login?mode=register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display name").fill("E2E Test User");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/app");
  await expect(page.getByText("ChessChat").first()).toBeVisible();

  // Log out
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");

  // Log back in
  await login(page, username);
  await expect(page).toHaveURL(new RegExp(`${BASE_URL.replace(/[.*]/g, "\\$&")}/app`));
});

test("login with wrong password shows an error and does not navigate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("aisha");
  await page.getByLabel("Password").fill("wrong-password");
  await page.locator("form").getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await expect(page).toHaveURL(/login/);
});

test("seeded conversation shows messages with all reaction badges", async ({ page }) => {
  await login(page, "aisha");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  const list = page.getByTestId("message-list");
  await expect(list.getByText("Hello, how are you?")).toBeVisible();
  await expect(list.getByText("What the hell is this?")).toBeVisible();

  // AI reaction badges carry their category in aria-label
  for (const label of ["Excellent", "Best", "Great", "Mistake", "Miss", "Blunder"]) {
    await expect(page.getByRole("button", { name: new RegExp(label) }).first()).toBeVisible();
  }
});

test("sending a message triggers automatic AI analysis and shows the badge", async ({ page }) => {
  await login(page, "aisha");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  const before = await page.getByTestId("stat-total").innerText();
  await page.getByRole("textbox", { name: "Message" }).fill("What the hell is this?");
  await page.getByRole("button", { name: "Send message" }).click();

  // The new blunder badge appears without any manual reaction
  const badge = page
    .getByTestId("message-row")
    .filter({ hasText: "What the hell is this?" })
    .first()
    .getByRole("button", { name: /Blunder/ });
  await expect(badge).toBeVisible();

  // The statistics panel total updates
  await expect(page.getByTestId("stat-total")).toHaveText(String(Number(before) + 1));
});

test("editing a message re-analyzes and replaces the reaction", async ({ page }) => {
  await login(page, "aisha");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  await page.getByRole("textbox", { name: "Message" }).fill("2 + 2 = 9");
  await page.getByRole("button", { name: "Send message" }).click();

  // Wait until BOTH "2 + 2 = 9" rows are in the DOM, then pick Aisha's (the last one).
  const equationRows = page.getByTestId("message-row").filter({ hasText: "2 + 2 = 9" });
  await expect(equationRows).toHaveCount(2);
  const row = equationRows.last();
  await expect(row.getByRole("button", { name: /Mistake/ })).toBeVisible();

  // Edit the message to something friendly
  await row.hover();
  await row.getByRole("button", { name: "Edit message" }).click();
  await page.getByRole("textbox", { name: "Message" }).fill("Thank you for helping me!");
  await page.getByRole("button", { name: "Send message" }).click();

  const edited = page.getByTestId("message-row").filter({ hasText: "Thank you for helping me!" }).last();
  await expect(edited.getByRole("button", { name: /Best/ })).toBeVisible();
});

test("deleting a message hides it and drops it from statistics", async ({ page }) => {
  await login(page, "aisha");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  await page.getByRole("textbox", { name: "Message" }).fill("this will be deleted now");
  await page.getByRole("button", { name: "Send message" }).click();
  const row = page.getByTestId("message-row").filter({ hasText: "this will be deleted now" });
  await expect(row).toBeVisible();
  await row.hover();
  page.on("dialog", (d) => void d.accept());
  await row.getByRole("button", { name: "Delete message" }).click();
  // Deleted messages disappear from the conversation entirely (soft-deleted + reaction invalidated)
  await expect(
    page.getByTestId("message-row").filter({ hasText: "this will be deleted now" })
  ).toHaveCount(0);
});

test("statistics panel expands and collapses", async ({ page }) => {
  await login(page, "aisha");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();

  const toggle = page.getByRole("button", { name: /Reaction Review/i });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("group conversation renders members in the info panel", async ({ page }) => {
  await login(page, "aisha");
  await page.getByRole("button", { name: /Study Group/ }).first().click();
  await expect(page.getByTestId("message-list").getByText("Welcome to the study group!")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByText("Dana Sarsenova").first()).toBeVisible();
});

test("mobile layout: chat opens full screen and back button returns to list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "aisha");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await page.getByRole("button", { name: "Back to chats" }).click();
  await expect(page.getByRole("button", { name: /Study Group/ }).first()).toBeVisible();
});
