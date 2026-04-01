import { describe, expect, test } from "bun:test";
import { buildCollapsedWorkspaceEntries } from "../src/components/layout/ProjectWorkspaceSidebar.utils";

describe("buildCollapsedWorkspaceEntries", () => {
  test("marks the first workspace of each later project for collapsed separators", () => {
    const entries = buildCollapsedWorkspaceEntries({
      activeWorkspaceId: "ws-3",
      projects: [
        {
          projectPath: "/tmp/project-a",
          projectName: "project-a",
          workspaces: [
            {
              id: "ws-1",
              name: "Default Workspace",
              isDefault: true,
              branch: "main",
            },
            {
              id: "ws-2",
              name: "feature/a",
              isDefault: false,
              branch: "feature/a",
            },
          ],
          activeWorkspaceId: "ws-2",
          isCurrent: false,
        },
        {
          projectPath: "/tmp/project-b",
          projectName: "project-b",
          workspaces: [{
            id: "ws-3",
            name: "Default Workspace",
            isDefault: true,
            branch: "main",
          }],
          activeWorkspaceId: "ws-3",
          isCurrent: true,
        },
      ],
    });

    expect(entries.map((entry) => ({
      workspaceId: entry.workspaceId,
      startsProjectGroup: entry.startsProjectGroup,
      isActive: entry.isActive,
    }))).toEqual([
      { workspaceId: "ws-1", startsProjectGroup: false, isActive: false },
      { workspaceId: "ws-2", startsProjectGroup: false, isActive: false },
      { workspaceId: "ws-3", startsProjectGroup: true, isActive: true },
    ]);
  });

  test("does not create a separator before the first rendered workspace group", () => {
    const entries = buildCollapsedWorkspaceEntries({
      activeWorkspaceId: "ws-2",
      projects: [
        {
          projectPath: "/tmp/empty-project",
          projectName: "empty-project",
          workspaces: [],
          activeWorkspaceId: "",
          isCurrent: false,
        },
        {
          projectPath: "/tmp/project-b",
          projectName: "project-b",
          workspaces: [{
            id: "ws-2",
            name: "Default Workspace",
            isDefault: true,
            branch: "main",
          }],
          activeWorkspaceId: "ws-2",
          isCurrent: true,
        },
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.startsProjectGroup).toBeFalse();
  });
});
