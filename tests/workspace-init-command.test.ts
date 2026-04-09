import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildImportedWorktreeWorkspaceId } from "@/store/project.utils";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext(args: { api?: unknown }) {
  (globalThis as { window?: unknown }).window = {
    api: args.api,
    localStorage: createMemoryStorage(),
  } as unknown;
}

beforeEach(() => {
  setWindowContext({});
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("new workspace init command", () => {
  test("runs the configured command in the created workspace root", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return {
              ok: true,
              code: 0,
              stdout: args.command === "bun install" ? "installed" : "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [{
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        lastOpenedAt: "2026-03-26T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [],
        activeWorkspaceId: "",
        workspaceBranchById: {},
        workspacePathById: {},
        workspaceDefaultById: {},
        newWorkspaceInitCommand: "bun install",
      }],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/bootstrap",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "success",
    });
    expect(result.message).toContain("bun install");
    expect(runCalls.map((call) => call.command)).toEqual([
      "mkdir -p .stave/workspaces",
      "git worktree add -b \"feature/bootstrap\" \"/tmp/stave-project/.stave/workspaces/feature__bootstrap\" \"main\"",
      "bun install",
    ]);
    expect(runCalls[2]).toEqual({
      cwd: "/tmp/stave-project/.stave/workspaces/feature__bootstrap",
      command: "bun install",
    });
    expect(useAppStore.getState().workspaces).toHaveLength(1);
    expect(useAppStore.getState().workspaces[0]?.id).toBe(buildImportedWorktreeWorkspaceId({
      projectPath: "/tmp/stave-project",
      worktreePath: "/tmp/stave-project/.stave/workspaces/feature__bootstrap",
    }));
    expect(useAppStore.getState().tasks).toHaveLength(1);
    expect(useAppStore.getState().tasks[0]?.title).toBe("New Task");
    expect(useAppStore.getState().activeTaskId).toBe(useAppStore.getState().tasks[0]?.id);
  });

  test("reuses the repository root node_modules via symlink before the post-create command when configured", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [{
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        lastOpenedAt: "2026-03-26T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [],
        activeWorkspaceId: "",
        workspaceBranchById: {},
        workspacePathById: {},
        workspaceDefaultById: {},
        newWorkspaceInitCommand: "bun run bootstrap:workspace",
        newWorkspaceUseRootNodeModulesSymlink: true,
      }],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/shared-deps",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "success",
    });
    expect(result.message).toContain("Linked `node_modules`");
    expect(result.message).toContain("bun run bootstrap:workspace");
    expect(runCalls.map((call) => call.command)).toEqual([
      "mkdir -p .stave/workspaces",
      "git worktree add -b \"feature/shared-deps\" \"/tmp/stave-project/.stave/workspaces/feature__shared-deps\" \"main\"",
      runCalls[2]?.command ?? "",
      "bun run bootstrap:workspace",
    ]);
    expect(runCalls[2]?.cwd).toBe("/tmp/stave-project/.stave/workspaces/feature__shared-deps");
    expect(runCalls[2]?.command).toContain("ln -s \"/tmp/stave-project/node_modules\" node_modules");
    expect(runCalls[3]).toEqual({
      cwd: "/tmp/stave-project/.stave/workspaces/feature__shared-deps",
      command: "bun run bootstrap:workspace",
    });
  });

  test("keeps the workspace when the shared node_modules symlink fails", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            if (args.command.includes("ln -s \"/tmp/stave-project/node_modules\" node_modules")) {
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: "ln: node_modules: File exists",
              };
            }
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [{
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        lastOpenedAt: "2026-03-26T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [],
        activeWorkspaceId: "",
        workspaceBranchById: {},
        workspacePathById: {},
        workspaceDefaultById: {},
        newWorkspaceInitCommand: "",
        newWorkspaceUseRootNodeModulesSymlink: true,
      }],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/shared-deps-warning",
      mode: "clean",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "warning",
    });
    expect(result.message).toContain("Linking the shared root `node_modules` failed");
    expect(result.message).toContain("ln: node_modules: File exists");
    expect(runCalls[2]?.cwd).toBe("/tmp/stave-project/.stave/workspaces/feature__shared-deps-warning");
    expect(runCalls[2]?.command).toContain("ln -s \"/tmp/stave-project/node_modules\" node_modules");
    expect(useAppStore.getState().workspaces).toHaveLength(1);
  });

  test("keeps the workspace when the configured command fails", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            if (args.command === "npm install") {
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: "npm ERR! missing lockfile",
              };
            }
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [{
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        lastOpenedAt: "2026-03-26T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [],
        activeWorkspaceId: "",
        workspaceBranchById: {},
        workspacePathById: {},
        workspaceDefaultById: {},
        newWorkspaceInitCommand: "npm install",
      }],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/failing-bootstrap",
      mode: "clean",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "warning",
    });
    expect(result.message).toContain("post-create command failed");
    expect(result.message).toContain("npm ERR! missing lockfile");
    expect(runCalls.at(-1)).toEqual({
      cwd: "/tmp/stave-project/.stave/workspaces/feature__failing-bootstrap",
      command: "npm install",
    });
    expect(useAppStore.getState().workspaces).toHaveLength(1);
    expect(useAppStore.getState().activeWorkspaceId).not.toBe("");
  });
});
