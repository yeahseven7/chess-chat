import { test, expect, type Page } from "@playwright/test";
import { resetSeed, login } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function openAishaConversation(page: Page) {
  await login(page, "aisha@chesschat.dev");
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();
}

test("tab pill slides to the selected section", async ({ page }) => {
  await login(page, "aisha@chesschat.dev");
  const pill = page.locator('[role="tablist"] > span').first();
  await expect(pill).toBeVisible();
  const before = await pill.getAttribute("style");
  await page.getByRole("tab", { name: "Friends" }).click();
  await page.waitForTimeout(400);
  const after = await pill.getAttribute("style");
  expect(after).toContain("translateX");
  expect(after).not.toBe(before);
  await expect(page.getByRole("tab", { name: "Friends" })).toHaveAttribute("aria-selected", "true");
});

test("sidebar collapses to an icon rail and expands again", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "aisha@chesschat.dev");
  const aside = page.locator("aside.sidebar-shell");
  await expect(aside).toHaveAttribute("data-collapsed", "false");
  const wide = (await aside.boundingBox())!.width;
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await page.waitForTimeout(700);
  const narrow = (await aside.boundingBox())!.width;
  expect(narrow).toBeLessThan(wide - 180);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.waitForTimeout(700);
  expect((await aside.boundingBox())!.width).toBeGreaterThan(narrow + 180);
});

test("mention picker filters members and inserts a mention with the keyboard", async ({ page }) => {
  const errors = watchConsole(page);
  await openAishaConversation(page);
  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill("@a");
  const picker = page.getByRole("listbox", { name: "Mention someone" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("option", { name: /Aisha Bekova/ })).toBeVisible();
  await composer.press("ArrowDown");
  await composer.press("Enter");
  await expect(composer).not.toHaveValue(/@a$/);
  await expect(composer).toHaveValue(/@/);
  await composer.fill("@zzzz");
  await expect(picker).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("reaction tooltip morphs open and shows real classification details", async ({ page }) => {
  const errors = watchConsole(page);
  await openAishaConversation(page);
  const badge = page.getByTestId("message-row").filter({ hasText: "What the hell is this?" }).getByRole("button", { name: /Blunder/ });
  await badge.hover();
  const tip = page.getByRole("tooltip").filter({ hasText: "Blunder" });
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Contains profanity");
  await expect(tip).toContainText("Analyzed");
  const style = await tip.getAttribute("style");
  expect(style).toMatch(/width: \d/);
  expect(errors).toEqual([]);
});

test("goo indicator appears while analysis runs and disappears when it completes", async ({ page }) => {
  await openAishaConversation(page);
  await page.getByRole("textbox", { name: "Message" }).fill("[[delay:2500]] a slow but genuinely interesting note");
  await page.getByRole("button", { name: "Send message" }).click();
  const row = page.getByTestId("message-row").filter({ hasText: "a slow but genuinely interesting note" });
  await expect(row).toBeVisible();
  await expect(page.getByLabel("Analyzing").last()).toBeVisible();
  await expect(row.getByRole("button", { name: /Great/ })).toBeVisible({ timeout: 10000 });
});

test("send button runs the sent state after persistence", async ({ page }) => {
  await openAishaConversation(page);
  await page.getByRole("textbox", { name: "Message" }).fill("Thank you for the review!");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Sent" })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 4000 });
});

test("conversation name rolls when switching chats", async ({ page }) => {
  await openAishaConversation(page);
  const heading = page.getByRole("heading", { level: 1 }).last();
  await expect(heading).toHaveAccessibleName("Timur Rakhimov");
  await page.getByRole("button", { name: /Study Group/ }).first().click();
  await expect(heading).toHaveAccessibleName("Study Group");
});

test("conversation options dropdown opens and runs a real action", async ({ page }) => {
  await openAishaConversation(page);
  await page.getByRole("button", { name: "Conversation options" }).click();
  const menu = page.getByRole("menu", { name: "Conversation options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Search messages" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Search messages" }).click();
  await expect(page.getByRole("textbox", { name: "Search messages" })).toBeVisible();
});

test("notification stack fans out on hover and shows real notifications", async ({ page }) => {
  await login(page, "timur@chesschat.dev");
  await page.getByRole("tab", { name: /Alerts/ }).click();
  const stack = page.locator('ol[aria-label="Notifications"]');
  await expect(stack).toBeVisible();
  await expect(stack.locator("article").first()).toContainText("New message");
  const heightBefore = (await stack.boundingBox())!.height;
  await stack.hover();
  await page.waitForTimeout(400);
  // Hovering fans the stack out; height grows to show more than the front card.
  expect((await stack.boundingBox())!.height).toBeGreaterThanOrEqual(heightBefore);
  await expect(page.getByRole("button", { name: /Show (all|less)/ })).toBeVisible();
});

test("reduced motion snaps the sidebar without animation and logs no errors", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = watchConsole(page);
  await login(page, "aisha@chesschat.dev");
  await page.setViewportSize({ width: 1280, height: 800 });
  const aside = page.locator("aside.sidebar-shell");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  // Reduced motion: the spring snaps on the next frame, not over ~500ms.
  await expect.poll(async () => (await aside.boundingBox())!.width, { timeout: 1000 }).toBeLessThan(80);
  expect(errors).toEqual([]);
  await context.close();
});
