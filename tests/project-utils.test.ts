import { describe, expect, test } from "bun:test";
import { normalizeProjectDisplayName, normalizeRecentProjectStates } from "@/store/project.utils";

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
});
