import { describe, expect, test } from "bun:test";
import {
  buildProjectDefaultWorkspaceId,
  formatWorkspacePathLabel,
  isDefaultWorkspaceName,
  normalizeCurrentProjectState,
  normalizeProjectBasePrompt,
  normalizeProjectDisplayName,
  normalizeRecentProjectStates,
  resolvePathBaseName,
  resolveProjectForWorkspaceId,
  resolveTaskWorkspaceContext,
  resolveCurrentProjectDefaultWorkspaceId,
  resolveWorkspaceName,
} from "@/store/project.utils";

const PROJECT_PATH = "/tmp/workspace/stave";
const FOREIGN_PROJECT_PATH = "/tmp/sbdashboard";
const FEATURE_WORKSPACE_PATH = `${PROJECT_PATH}/.stave/workspaces/feat__auto-update-on-mac`;
const DEFAULT_WORKSPACE_ID = buildProjectDefaultWorkspaceId({
  projectPath: PROJECT_PATH,
});

describe("project name normalization", () => {
  test("resolves path basenames after trimming trailing separators", () => {
    expect(resolvePathBaseName({ path: "/tmp/workspace/stave/" })).toBe("stave");
    expect(resolvePathBaseName({ path: "", fallback: "project" })).toBe("project");
  });

  test("identifies the default workspace name case-insensitively", () => {
    expect(isDefaultWorkspaceName("Default Workspace")).toBe(true);
    expect(isDefaultWorkspaceName("default workspace")).toBe(true);
    expect(isDefaultWorkspaceName("feature/refactor")).toBe(false);
  });

  test("formats workspace paths relative to the project root when possible", () => {
    expect(formatWorkspacePathLabel({
      workspacePath: "/tmp/workspace/stave/.stave/workspaces/feat__agent-ui",
      projectPath: PROJECT_PATH,
    })).toBe(".stave/workspaces/feat__agent-ui");

    expect(formatWorkspacePathLabel({
      workspacePath: PROJECT_PATH,
      projectPath: PROJECT_PATH,
    })).toBe(PROJECT_PATH);
  });

  test("replaces the generic placeholder name with the folder basename", () => {
    expect(normalizeProjectDisplayName({
      projectPath: PROJECT_PATH,
      projectName: "project",
    })).toBe("stave");
  });

  test("normalizes persisted recent projects that still carry the placeholder name", () => {
    const projects = normalizeRecentProjectStates({
      projects: [{
        projectPath: PROJECT_PATH,
        projectName: "project",
        lastOpenedAt: "2026-03-30T13:35:33.466Z",
        defaultBranch: "main",
        workspaces: [{
          id: DEFAULT_WORKSPACE_ID,
          name: "Default Workspace",
          updatedAt: "2026-03-30T13:06:25.031Z",
        }],
        activeWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
        workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
        workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
      }],
    });

    expect(projects[0]?.projectName).toBe("stave");
  });

  test("trims and preserves the project base prompt", () => {
    const projects = normalizeRecentProjectStates({
      projects: [{
        projectPath: "/Users/jacob.kim/workspace/stave",
        projectName: "stave",
        lastOpenedAt: "2026-03-30T13:35:33.466Z",
        defaultBranch: "main",
        workspaces: [],
        activeWorkspaceId: "",
        workspaceBranchById: {},
        workspacePathById: {},
        workspaceDefaultById: {},
        projectBasePrompt: "  Prefer bun over npm.  ",
      }],
    });

    expect(projects[0]?.projectBasePrompt).toBe("Prefer bun over npm.");
    expect(normalizeProjectBasePrompt({ value: undefined })).toBe("");
  });

  test("rejects a foreign default workspace when its path points at another project", () => {
    expect(resolveCurrentProjectDefaultWorkspaceId({
      projectPath: PROJECT_PATH,
      workspaces: [{
        id: "base:1i2znya",
        name: "Default Workspace",
        updatedAt: "2026-03-31T13:36:19.071Z",
      }],
      workspaceDefaultById: { "base:1i2znya": true },
      workspacePathById: {
        "base:1i2znya": FOREIGN_PROJECT_PATH,
      },
    })).toBe(buildProjectDefaultWorkspaceId({
      projectPath: PROJECT_PATH,
    }));
  });

  test("repairs a corrupted project registry entry whose default workspace came from another project", () => {
    const projects = normalizeRecentProjectStates({
      projects: [{
        projectPath: PROJECT_PATH,
        projectName: "stave",
        lastOpenedAt: "2026-03-31T13:36:33.211Z",
        defaultBranch: "main",
        workspaces: [
          {
            id: "base:1i2znya",
            name: "Default Workspace",
            updatedAt: "2026-03-31T13:36:19.071Z",
          },
          {
            id: "3158a1b0-acfa-4413-b0c3-e5c7c7441c86",
            name: "feat/auto-update-on-mac",
            updatedAt: "2026-03-31T13:28:16.529Z",
          },
        ],
        activeWorkspaceId: "base:1i2znya",
        workspaceBranchById: {
          "base:1i2znya": "master",
          "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "feat/auto-update-on-mac",
        },
        workspacePathById: {
          "base:1i2znya": FOREIGN_PROJECT_PATH,
          "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": FEATURE_WORKSPACE_PATH,
        },
        workspaceDefaultById: { "base:1i2znya": true },
      }],
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      projectPath: PROJECT_PATH,
      projectName: "stave",
      lastOpenedAt: "2026-03-31T13:36:33.211Z",
      defaultBranch: "main",
      workspaces: [
        {
          id: DEFAULT_WORKSPACE_ID,
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:33.211Z",
        },
        {
          id: "3158a1b0-acfa-4413-b0c3-e5c7c7441c86",
          name: "feat/auto-update-on-mac",
          updatedAt: "2026-03-31T13:28:16.529Z",
        },
      ],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: {
        [DEFAULT_WORKSPACE_ID]: "main",
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "feat/auto-update-on-mac",
      },
      workspacePathById: {
        [DEFAULT_WORKSPACE_ID]: PROJECT_PATH,
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": FEATURE_WORKSPACE_PATH,
      },
      workspaceDefaultById: {
        [DEFAULT_WORKSPACE_ID]: true,
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": false,
      },
      projectBasePrompt: "",
      newWorkspaceInitCommand: "",
      newWorkspaceUseRootNodeModulesSymlink: false,
    });
  });

  test("normalizes the current project workspace state against the repaired registry entry", () => {
    const normalized = normalizeCurrentProjectState({
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [{
        id: "base:1i2znya",
        name: "Default Workspace",
        updatedAt: "2026-03-31T13:36:19.071Z",
      }],
      activeWorkspaceId: "base:1i2znya",
      workspaceBranchById: { "base:1i2znya": "master" },
      workspacePathById: { "base:1i2znya": FOREIGN_PROJECT_PATH },
      workspaceDefaultById: { "base:1i2znya": true },
      recentProjects: [{
        projectPath: PROJECT_PATH,
        projectName: "stave",
        lastOpenedAt: "2026-03-31T13:36:33.211Z",
        defaultBranch: "main",
        workspaces: [{
          id: "base:1i2znya",
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:19.071Z",
        }],
        activeWorkspaceId: "base:1i2znya",
        workspaceBranchById: { "base:1i2znya": "master" },
        workspacePathById: { "base:1i2znya": FOREIGN_PROJECT_PATH },
        workspaceDefaultById: { "base:1i2znya": true },
      }],
    });

    expect(normalized).toMatchObject({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
      workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
    });
  });

  test("resolves workspace names from current state before falling back to recents", () => {
    expect(resolveWorkspaceName({
      workspaceId: "ws-current",
      state: {
        workspaces: [{ id: "ws-current", name: "feature/current", updatedAt: "2026-04-16T00:00:00.000Z" }],
        recentProjects: [{
          projectPath: "/tmp/other-project",
          projectName: "other-project",
          lastOpenedAt: "2026-04-16T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [{ id: "ws-recent", name: "feature/recent", updatedAt: "2026-04-16T00:00:00.000Z" }],
          activeWorkspaceId: "ws-recent",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        }],
      },
    })).toBe("feature/current");

    expect(resolveWorkspaceName({
      workspaceId: "ws-recent",
      state: {
        workspaces: [],
        recentProjects: [{
          projectPath: "/tmp/other-project",
          projectName: "other-project",
          lastOpenedAt: "2026-04-16T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [{ id: "ws-recent", name: "feature/recent", updatedAt: "2026-04-16T00:00:00.000Z" }],
          activeWorkspaceId: "ws-recent",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        }],
      },
    })).toBe("feature/recent");
  });

  test("resolves the owning project for a workspace from current state or recents", () => {
    expect(resolveProjectForWorkspaceId({
      workspaceId: "ws-current",
      state: {
        projectPath: PROJECT_PATH,
        projectName: "stave",
        workspaces: [{ id: "ws-current", name: "feature/current", updatedAt: "2026-04-16T00:00:00.000Z" }],
        recentProjects: [],
      },
    })).toEqual({
      projectPath: PROJECT_PATH,
      projectName: "stave",
    });

    expect(resolveProjectForWorkspaceId({
      workspaceId: "ws-recent",
      state: {
        projectPath: null,
        projectName: null,
        workspaces: [],
        recentProjects: [{
          projectPath: "/tmp/other-project",
          projectName: "other-project",
          lastOpenedAt: "2026-04-16T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [{ id: "ws-recent", name: "feature/recent", updatedAt: "2026-04-16T00:00:00.000Z" }],
          activeWorkspaceId: "ws-recent",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        }],
      },
    })).toEqual({
      projectPath: "/tmp/other-project",
      projectName: "other-project",
    });
  });

  test("resolves task workspace context from task ownership before falling back to the active workspace", () => {
    expect(resolveTaskWorkspaceContext({
      taskId: "task-1",
      activeWorkspaceId: "ws-active",
      taskWorkspaceIdById: { "task-1": "ws-owned" },
      workspacePathById: {
        "ws-active": "/tmp/active",
        "ws-owned": "/tmp/owned",
      },
      workspaceDefaultById: { "ws-active": true, "ws-owned": false },
      projectPath: "/tmp/project",
    })).toEqual({
      workspaceId: "ws-owned",
      cwd: "/tmp/owned",
    });
  });
});
