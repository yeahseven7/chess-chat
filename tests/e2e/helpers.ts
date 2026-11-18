import type { Page, APIRequestContext } from "@playwright/test";

export const PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = `http://localhost:${PORT}`;

/** Reset the local database to the deterministic fixture set. */
export async function resetSeed(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${BASE_URL}/api/dev/seed`);
  if (!res.ok()) {
    throw new Error(`Seed reset failed: ${res.status()} ${await res.text()}`);
  }
}

/** Log in through the UI. */
export async function login(page: Page, username: string, password = "password123"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
}

/** Open the direct conversation with Timur (as seen by Aisha). */
export async function openTimurConversation(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Timur Rakhimov/ }).first().click();
  await page.getByRole("textbox", { name: "Message" }).waitFor();
}
