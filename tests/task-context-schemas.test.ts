import { describe, expect, test } from "bun:test";
import { parseWorkspaceShell, parseWorkspaceSnapshot } from "../src/lib/task-context/schemas";

function createWorkspaceBase() {
  return {
    activeTaskId: "",
    tasks: [],
    promptDraftByTask: {},
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
    terminalTabs: [{
      id: "terminal-1",
      title: "Workspace",
      linkedTaskId: null,
      backend: "xterm",
      cwd: "/tmp/workspace",
      createdAt: 1,
    }],
    activeTerminalTabId: "terminal-1",
    cliSessionTabs: [],
    activeCliSessionTabId: null,
    activeSurface: {
      kind: "task",
      taskId: "",
    },
    workspaceInformation: {
      jiraIssues: [],
      confluencePages: [],
      figmaResources: [],
      linkedPullRequests: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    },
  };
}

describe("task-context workspace schemas", () => {
  test("normalizes legacy xterm terminal tabs in workspace shell payloads", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        messageCountByTask: {},
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.terminalTabs).toEqual([{
      id: "terminal-1",
      title: "Workspace",
      linkedTaskId: null,
      backend: "ghostty",
      cwd: "/tmp/workspace",
      createdAt: 1,
    }]);
  });

  test("normalizes legacy xterm terminal tabs in workspace snapshot payloads", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        messagesByTask: {},
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.terminalTabs?.[0]?.backend).toBe("ghostty");
  });
});
