import { describe, expect, test } from "bun:test";
import {
  buildProjectDefaultWorkspaceId,
  normalizeCurrentProjectState,
  normalizeProjectBasePrompt,
  normalizeProjectDisplayName,
  normalizeRecentProjectStates,
  resolveTaskWorkspaceContext,
  resolveCurrentProjectDefaultWorkspaceId,
} from "@/store/project.utils";

describe("project name normalization", () => {
  test("replaces the generic placeholder name with the folder basename", () => {
    expect(normalizeProjectDisplayName({
      projectPath: "/Users/jacob.kim/workspace/stave",
      projectName: "project",
    })).toBe("stave");
  });

  test("normalizes persisted recent projects that still carry the placeholder name", () => {
    const projects = normalizeRecentProjectStates({
      projects: [{
        projectPath: "/Users/jacob.kim/workspace/stave",
        projectName: "project",
        lastOpenedAt: "2026-03-30T13:35:33.466Z",
        defaultBranch: "main",
        workspaces: [{
          id: "base:75px8d",
          name: "Default Workspace",
          updatedAt: "2026-03-30T13:06:25.031Z",
        }],
        activeWorkspaceId: "base:75px8d",
        workspaceBranchById: { "base:75px8d": "main" },
        workspacePathById: { "base:75px8d": "/Users/jacob.kim/workspace/stave" },
        workspaceDefaultById: { "base:75px8d": true },
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
      projectPath: "/Users/jacob.kim/workspace/stave",
      workspaces: [{
        id: "base:1i2znya",
        name: "Default Workspace",
        updatedAt: "2026-03-31T13:36:19.071Z",
      }],
      workspaceDefaultById: { "base:1i2znya": true },
      workspacePathById: {
        "base:1i2znya": "/Users/jacob.kim/projects/sbdashboard",
      },
    })).toBe(buildProjectDefaultWorkspaceId({
      projectPath: "/Users/jacob.kim/workspace/stave",
    }));
  });

  test("repairs a corrupted project registry entry whose default workspace came from another project", () => {
    const projects = normalizeRecentProjectStates({
      projects: [{
        projectPath: "/Users/jacob.kim/workspace/stave",
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
          "base:1i2znya": "/Users/jacob.kim/projects/sbdashboard",
          "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "/Users/jacob.kim/workspace/stave/.stave/workspaces/feat__auto-update-on-mac",
        },
        workspaceDefaultById: { "base:1i2znya": true },
      }],
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      projectPath: "/Users/jacob.kim/workspace/stave",
      projectName: "stave",
      lastOpenedAt: "2026-03-31T13:36:33.211Z",
      defaultBranch: "main",
      workspaces: [
        {
          id: "base:75px8d",
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:33.211Z",
        },
        {
          id: "3158a1b0-acfa-4413-b0c3-e5c7c7441c86",
          name: "feat/auto-update-on-mac",
          updatedAt: "2026-03-31T13:28:16.529Z",
        },
      ],
      activeWorkspaceId: "base:75px8d",
      workspaceBranchById: {
        "base:75px8d": "main",
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "feat/auto-update-on-mac",
      },
      workspacePathById: {
        "base:75px8d": "/Users/jacob.kim/workspace/stave",
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "/Users/jacob.kim/workspace/stave/.stave/workspaces/feat__auto-update-on-mac",
      },
      workspaceDefaultById: {
        "base:75px8d": true,
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": false,
      },
      projectBasePrompt: "",
      newWorkspaceInitCommand: "",
      newWorkspaceUseRootNodeModulesSymlink: false,
    });
  });

  test("normalizes the current project workspace state against the repaired registry entry", () => {
    const normalized = normalizeCurrentProjectState({
      projectPath: "/Users/jacob.kim/workspace/stave",
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [{
        id: "base:1i2znya",
        name: "Default Workspace",
        updatedAt: "2026-03-31T13:36:19.071Z",
      }],
      activeWorkspaceId: "base:1i2znya",
      workspaceBranchById: { "base:1i2znya": "master" },
      workspacePathById: { "base:1i2znya": "/Users/jacob.kim/projects/sbdashboard" },
      workspaceDefaultById: { "base:1i2znya": true },
      recentProjects: [{
        projectPath: "/Users/jacob.kim/workspace/stave",
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
        workspacePathById: { "base:1i2znya": "/Users/jacob.kim/projects/sbdashboard" },
        workspaceDefaultById: { "base:1i2znya": true },
      }],
    });

    expect(normalized).toMatchObject({
      activeWorkspaceId: "base:75px8d",
      workspaceBranchById: { "base:75px8d": "main" },
      workspacePathById: { "base:75px8d": "/Users/jacob.kim/workspace/stave" },
      workspaceDefaultById: { "base:75px8d": true },
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
