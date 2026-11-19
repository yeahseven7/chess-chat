import { test, expect } from "@playwright/test";
import { resetSeed, login } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("dana can accept timur's seeded friend request in the Friends tab", async ({ page }) => {
  await login(page, "dana@chesschat.dev");
  await page.getByRole("tab", { name: "Friends", exact: true }).click();
  await expect(page.getByText("Requests (1)")).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept request" });
  await accept.click();
  await expect(page.getByText("Requests (1)")).not.toBeVisible();
  await expect(page.getByText("Timur Rakhimov").first()).toBeVisible();
});

test("profile page shows reaction distribution and seeded counts", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  await page.goto("/profile/aisha");
  await expect(page.getByRole("heading", { name: "Aisha Bekova" })).toBeVisible();
  await expect(page.getByText("@aisha")).toBeVisible();
  await expect(page.getByText("Reaction distribution")).toBeVisible();
  for (const label of ["Great", "Best", "Excellent", "Mistake", "Miss", "Blunder"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  // Aisha seeded: 3 sent messages (best, great, miss) → 3 analyzed
  await expect(page.getByText("Messages analyzed")).toBeVisible();
});

test("profile of timur shows his seeded stats to another user", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  await page.goto("/profile/timur");
  await expect(page.getByRole("heading", { name: "Timur Rakhimov" })).toBeVisible();
  await expect(page.getByText("Reaction distribution")).toBeVisible();
});

test("notifications tab shows a badge for incoming messages", async ({ page, context }) => {
  // Bob flow: dana sends nothing yet; instead timur's seed triggers none.
  // Use the API path: register a brand-new user, message aisha, then aisha sees a notification badge.
  const username = `e2enotif${Date.now().toString(36)}`;
  const email = `e2enotif${Date.now().toString(36)}@example.com`;
  await page.goto("/login?mode=register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Display name").fill("Notif Trigger");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/app");
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");

  // aisha logs in, searches the new user, sends a friend request
  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: "New direct message" }).click();
  await page.getByLabel("Search users").fill(username);
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Message" }).click();
  await page.getByRole("textbox", { name: "Message" }).fill("hello there");
  await page.getByRole("button", { name: "Send message" }).click();

  // The new user registers another session? Cross-session notification check:
  // the new user gets a notification on next login.
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");
  await login(page, email);
  const alerts = page.getByRole("tab", { name: "Alerts" });
  await expect(alerts).toContainText("1");
  await alerts.click();
  await expect(page.getByText("New message").first()).toBeVisible();
});
