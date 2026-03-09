import { expect, test } from "@playwright/test";

test("settings modal and workspace modal open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  await expect(page.getByText("Settings")).toBeVisible();
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  await page.getByRole("button", { name: "close-settings" }).click();

  await page.getByRole("button", { name: "new-workspace" }).click();
  await expect(page.getByText("Create New Workspace")).toBeVisible();
  await expect(page.getByText("Create From Branch")).toBeVisible();
});

test("right panel tabs switch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Explorer" }).click();
  const rightPanel = page.getByTestId("editor-panel");
  await expect(rightPanel).toBeVisible();
  await expect(rightPanel.getByText("Explorer panel", { exact: true })).toBeVisible();

  await rightPanel.getByTitle("changes").click();
  await expect(rightPanel.getByText(/Branch:/)).toBeVisible();
});
