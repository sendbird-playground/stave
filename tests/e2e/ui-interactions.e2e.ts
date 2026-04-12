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

test("terminal dock opens with the shared surface inset", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-04-10T01:00:00.000Z" }],
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
        createSession: async () => ({ ok: true, sessionId: "session-terminal-1" }),
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
        listBranches: async () => ({
          ok: true,
          current: "main",
          branches: ["main"],
          remoteBranches: [],
          worktreePathByBranch: { main: "/tmp/stave-project" },
          stderr: "",
        }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Terminal" }).click();

  const terminalDock = page.getByTestId("terminal-dock");
  await expect(terminalDock).toBeVisible();
  await expect(page.getByRole("button", { name: "new-terminal-tab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "hide-terminal" })).toBeVisible();

  const terminalSurface = terminalDock.locator("[data-terminal-surface]").first();
  await terminalSurface.waitFor({ state: "attached" });

  const padding = await terminalSurface.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      top: styles.paddingTop,
      right: styles.paddingRight,
      bottom: styles.paddingBottom,
      left: styles.paddingLeft,
    };
  });
  expect(padding).toEqual({
    top: "16px",
    right: "20px",
    bottom: "16px",
    left: "20px",
  });
});

test("cli session keeps the renderer alive and refocuses after switching back", async ({ page }) => {
  await page.addInitScript(() => {
    const sessions = new Map<string, { output: string; attached: boolean }>();
    const testState = { createCliSessionCallCount: 0 };

    window.localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([
      {
        id: "ws-main",
        name: "main",
        updatedAt: "2026-04-10T01:00:00.000Z",
        snapshot: {
          activeTaskId: "task-1",
          tasks: [{
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-04-10T01:00:00.000Z",
            unread: false,
            archivedAt: null,
          }],
          messagesByTask: { "task-1": [] },
          cliSessionTabs: [],
          activeCliSessionTabId: null,
          activeSurface: { kind: "task", taskId: "task-1" },
        },
      },
      {
        id: "ws-feature",
        name: "feature",
        updatedAt: "2026-04-10T00:30:00.000Z",
        snapshot: {
          activeTaskId: "task-2",
          tasks: [{
            id: "task-2",
            title: "Feature Task",
            provider: "codex",
            updatedAt: "2026-04-10T00:30:00.000Z",
            unread: false,
            archivedAt: null,
          }],
          messagesByTask: { "task-2": [] },
          cliSessionTabs: [],
          activeCliSessionTabId: null,
          activeSurface: { kind: "task", taskId: "task-2" },
        },
      },
    ]));

    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaces: [
          { id: "ws-main", name: "main", updatedAt: "2026-04-10T01:00:00.000Z" },
          { id: "ws-feature", name: "feature", updatedAt: "2026-04-10T00:30:00.000Z" },
        ],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "main", "ws-feature": "feature" },
        workspacePathById: {
          "ws-main": "/tmp/stave-project",
          "ws-feature": "/tmp/stave-project/.stave/workspaces/feature",
        },
        workspaceDefaultById: { "ws-main": true, "ws-feature": false },
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-04-10T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: { "task-1": [] },
        cliSessionTabs: [],
        activeCliSessionTabId: null,
        activeSurface: { kind: "task", taskId: "task-1" },
      },
      version: 0,
    }));

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
      },
      terminal: {
        createCliSession: async () => {
          testState.createCliSessionCallCount += 1;
          const sessionId = "cli-session-1";
          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, { output: "cli ready\r\n", attached: true });
          }
          return { ok: true, sessionId };
        },
        attachSession: async (args: { sessionId: string }) => {
          const session = sessions.get(args.sessionId);
          if (!session) {
            return { ok: false, stderr: "missing session" };
          }
          session.attached = true;
          const screenState = session.output;
          session.output = "";
          return { ok: true, screenState };
        },
        detachSession: async (args: { sessionId: string }) => {
          const session = sessions.get(args.sessionId);
          if (!session) {
            return { ok: false, stderr: "missing session" };
          }
          session.attached = false;
          return { ok: true };
        },
        getSlotState: async (_args: { slotKey: string }) => {
          const sessionId = "cli-session-1";
          const session = sessions.get(sessionId);
          if (!session) {
            return { state: "idle" as const };
          }
          return {
            state: session.attached ? "running" as const : "background" as const,
            sessionId,
          };
        },
        readSession: async (args: { sessionId: string }) => {
          const session = sessions.get(args.sessionId);
          if (!session) {
            return { ok: false, output: "" };
          }
          const output = session.output;
          session.output = "";
          return { ok: true, output };
        },
        writeSession: async () => ({ ok: true }),
        resizeSession: async () => ({ ok: true }),
        closeSession: async () => ({ ok: true }),
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
    (window as unknown as { __staveTestState?: typeof testState }).__staveTestState = testState;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "New CLI Session" }).first().click();
  await page.getByRole("menuitem").filter({ hasText: "Claude · Workspace" }).click();
  await page.getByRole("button", { name: "Claude Workspace", exact: true }).click();
  await expect(page.getByTestId("cli-session-panel")).toBeVisible();
  await expect(page.getByTestId("cli-session-panel").locator(".xterm")).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate(() => (
      (window as unknown as { __staveTestState?: { createCliSessionCallCount: number } })
        .__staveTestState?.createCliSessionCallCount ?? 0
    )))
    .toBe(1);

  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState((state) => ({
      ...state,
      activeTaskId: "task-1",
      activeSurface: { kind: "task", taskId: "task-1" },
    }));
  });
  await expect(page.getByTestId("cli-session-panel")).toBeHidden();
  await expect(page.getByText("Task 1")).toBeVisible();

  // Switch back to the CLI session surface.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState((state) => ({
      ...state,
      activeSurface: {
        kind: "cli-session",
        cliSessionTabId: state.activeCliSessionTabId ?? "",
      },
    }));
  });
  await expect(page.getByTestId("cli-session-panel").locator(".xterm")).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate(() => (
      (window as unknown as { __staveTestState?: { createCliSessionCallCount: number } })
        .__staveTestState?.createCliSessionCallCount ?? 0
    )))
    .toBe(1);
  const terminalSurface = page.getByTestId("cli-session-panel").locator("[data-terminal-surface]").first();
  await expect
    .poll(async () =>
      terminalSurface.evaluate((element) => {
        const textarea = element.querySelector(".xterm-helper-textarea");
        return textarea instanceof HTMLElement
          && document.activeElement === textarea;
      },
      )
    )
    .toBe(true);
  await expect
    .poll(async () =>
      terminalSurface.evaluate((element) =>
        Boolean(element.querySelector(".xterm-screen")),
      ))
    .toBe(true);
});

test("scripts manager waits for default scope and keeps draft entries dirty", async ({ page }) => {
  await page.addInitScript(() => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        recentProjects: [{
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-04-05T12:00:00.000Z",
          taskCount: 0,
          workspaceCount: 1,
          gitBranch: "main",
        }],
        workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-04-05T12:00:00.000Z" }],
        activeWorkspaceId: "ws-main",
        workspaceBranchById: { "ws-main": "feat-scripts" },
        workspacePathById: { "ws-main": "/tmp/stave-project/.stave/workspaces/feat-scripts" },
        workspaceDefaultById: { "ws-main": false },
      },
      version: 0,
    }));

    (window as unknown as { api?: Record<string, unknown> }).api = {
      fs: {
        readFile: async ({ rootPath }: { rootPath: string }) => {
          if (rootPath.includes("/.stave/workspaces/feat-scripts")) {
            await sleep(500);
            return { ok: true, content: "{\"version\":2}", revision: "ws-rev" };
          }
          await sleep(50);
          return {
            ok: false,
            stderr: "ENOENT: no such file or directory",
            content: "",
            revision: null,
          };
        },
        writeFile: async () => ({ ok: true, revision: "rev-1" }),
        createDirectory: async () => ({ ok: true, alreadyExists: true }),
      },
      scripts: {
        getConfig: async () => ({
          ok: true,
          config: {
            actions: [],
            services: [],
            hooks: {},
            targets: {
              workspace: { id: "workspace", label: "Workspace", cwd: "workspace", env: {} },
              project: { id: "project", label: "Project", cwd: "project", env: {} },
            },
            legacyPhases: { setup: [], run: [], teardown: [] },
          },
        }),
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

  await page.getByRole("button", { name: "open-settings" }).click();
  await page.getByRole("button", { name: "Projects" }).click();

  await expect(page.getByText("Loading scripts manager...")).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByRole("button", { name: "Add Action" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Add Action" })).toBeVisible();
  await page.getByRole("button", { name: "Add Action" }).click();

  await expect(page.getByText("Action 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Discard" })).toBeEnabled();
});
