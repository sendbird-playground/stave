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
  await page.addInitScript(() => {
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-03-06T01:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main" },
        workspacePathById: { "ws-main": "/tmp/stave-project" },
        workspaceDefaultById: { "ws-main": true },
      },
      version: 0,
    }));

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        getHistory: async () => ({
          ok: true,
          items: [],
          stderr: "",
        }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Explorer" }).click();
  const rightPanel = page.getByTestId("editor-panel");
  await expect(rightPanel).toBeVisible();
  await expect(rightPanel.getByRole("heading", { name: "Explorer" })).toBeVisible();

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Changes" }).click();
  await expect(rightPanel.getByRole("heading", { name: "Source Control" })).toBeVisible();
  await expect(rightPanel.getByRole("tab", { name: /Changes/ })).toBeVisible();

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Information" }).click();
  await expect(rightPanel.getByRole("heading", { name: "Information" })).toBeVisible();
});
