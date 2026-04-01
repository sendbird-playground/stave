import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildWorkspaceContinueSummaryFilePath,
  buildWorkspaceContinueSummaryMarkdown,
} from "../src/lib/workspace-continue";

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

describe("workspace continue summary helpers", () => {
  test("builds a stable summary file path and markdown brief", () => {
    const filePath = buildWorkspaceContinueSummaryFilePath({
      sourceBranch: "feature/pr-status",
    });
    expect(filePath).toBe(".stave/context/continued-from-feature-pr-status.md");

    const markdown = buildWorkspaceContinueSummaryMarkdown({
      generatedAt: "2026-04-01T00:00:00.000Z",
      sourceWorkspaceName: "feature/pr-status",
      sourceBranch: "feature/pr-status",
      baseBranch: "main",
      pr: {
        number: 12,
        title: "feat(topbar): add pr status",
        url: "https://example.com/pull/12",
        status: "merged",
      },
      activeTaskTitle: "Polish merged workspace flow",
      notes: "Remember the follow-up branch handoff.",
      openTodos: ["Handle merged workspace continue flow"],
      changedFiles: ["src/components/layout/TopBarOpenPR.tsx", "src/store/app.store.ts"],
      recentCommitSubjects: ["feat(topbar): add merged continue action"],
      diffStat: "2 files changed, 18 insertions(+), 3 deletions(-)",
    });

    expect(markdown).toContain("# Workspace Continue Brief");
    expect(markdown).toContain("## Pull Request");
    expect(markdown).toContain("feat(topbar): add pr status");
    expect(markdown).toContain("## Key Files");
    expect(markdown).toContain("`src/components/layout/TopBarOpenPR.tsx`");
    expect(markdown).toContain("Handle merged workspace continue flow");
  });
});

describe("continueWorkspaceFromSummary", () => {
  test("creates a new workspace and seeds the first task draft with the summary brief", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const createdDirectories: string[] = [];
    const createdFiles: string[] = [];
    const writtenFiles: Array<{ filePath: string; content: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            if (args.command.startsWith("git diff --stat ")) {
              return {
                ok: true,
                code: 0,
                stdout: " src/components/layout/TopBarOpenPR.tsx | 12 +++++++++---\n 1 file changed, 9 insertions(+), 3 deletions(-)\n",
                stderr: "",
              };
            }
            if (args.command.startsWith("git diff --name-only ")) {
              return {
                ok: true,
                code: 0,
                stdout: "src/components/layout/TopBarOpenPR.tsx\nsrc/store/app.store.ts\n",
                stderr: "",
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
        sourceControl: {
          getHistory: async () => ({
            ok: true,
            items: [
              { hash: "abc123", relativeDate: "1 day ago", subject: "feat(topbar): add merged continue action" },
            ],
            stderr: "",
          }),
        },
        fs: {
          pickRoot: async () => ({
            ok: true,
            rootPath: "/tmp/stave-project/.stave/workspaces/continue__pr-status",
            rootName: "continue/pr-status",
            files: [],
          }),
          listFiles: async () => ({
            ok: true,
            files: [...createdFiles],
          }),
          readFile: async () => ({
            ok: true,
            content: "",
            revision: "rev-1",
          }),
          createDirectory: async (args: { directoryPath: string }) => {
            createdDirectories.push(args.directoryPath);
            return {
              ok: true,
              alreadyExists: false,
            };
          },
          createFile: async (args: { filePath: string }) => {
            createdFiles.push(args.filePath);
            return {
              ok: true,
              alreadyExists: false,
              revision: "rev-2",
            };
          },
          writeFile: async (args: { filePath: string; content: string }) => {
            writtenFiles.push(args);
            return {
              ok: true,
              revision: "rev-3",
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
        lastOpenedAt: "2026-04-01T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [{ id: "ws-source", name: "feature/pr-status", updatedAt: "2026-04-01T00:00:00.000Z" }],
        activeWorkspaceId: "ws-source",
        workspaceBranchById: { "ws-source": "feature/pr-status" },
        workspacePathById: { "ws-source": "/tmp/stave-project/.stave/workspaces/feature__pr-status" },
        workspaceDefaultById: { "ws-source": false },
      }],
      workspaces: [{ id: "ws-source", name: "feature/pr-status", updatedAt: "2026-04-01T00:00:00.000Z" }],
      activeWorkspaceId: "ws-source",
      workspaceBranchById: { "ws-source": "feature/pr-status" },
      workspacePathById: { "ws-source": "/tmp/stave-project/.stave/workspaces/feature__pr-status" },
      workspaceDefaultById: { "ws-source": false },
      workspacePrInfoById: {
        "ws-source": {
          pr: {
            number: 12,
            title: "feat(topbar): add pr status",
            state: "MERGED",
            isDraft: false,
            url: "https://example.com/pull/12",
            reviewDecision: "APPROVED",
            mergeable: "MERGEABLE",
            mergeStateStatus: "CLEAN",
            checksRollup: "SUCCESS",
            mergedAt: "2026-04-01T00:00:00.000Z",
            baseRefName: "main",
            headRefName: "feature/pr-status",
          },
          derived: "merged",
          lastFetched: Date.now(),
        },
      },
      tasks: [{
        id: "task-source",
        title: "Polish merged workspace flow",
        provider: "codex",
        updatedAt: "2026-04-01T00:00:00.000Z",
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      }],
      activeTaskId: "task-source",
      messagesByTask: { "task-source": [] },
      promptDraftByTask: {},
      workspaceInformation: {
        jiraIssues: [],
        figmaResources: [],
        linkedPullRequests: [],
        notes: "Remember the follow-up branch handoff.",
        todos: [{ id: "todo-1", text: "Handle merged workspace continue flow", completed: false }],
        customFields: [],
      },
      projectFiles: [],
      taskWorkspaceIdById: { "task-source": "ws-source" },
    });

    const result = await useAppStore.getState().continueWorkspaceFromSummary({
      name: "continue/pr-status",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "success",
    });
    expect(result.message).toContain(".stave/context/continued-from-feature-pr-status.md");

    expect(runCalls.map((call) => call.command)).toEqual([
      "git diff --stat \"main\"...HEAD",
      "git diff --name-only \"main\"...HEAD",
      "mkdir -p .stave/workspaces",
      "git worktree add -b \"continue/pr-status\" \"/tmp/stave-project/.stave/workspaces/continue__pr-status\" \"main\"",
    ]);

    expect(createdDirectories).toEqual([".stave/context"]);
    expect(createdFiles).toEqual([".stave/context/continued-from-feature-pr-status.md"]);
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0]?.content).toContain("Remember the follow-up branch handoff.");
    expect(writtenFiles[0]?.content).toContain("feat(topbar): add merged continue action");

    const nextState = useAppStore.getState();
    expect(nextState.workspaces).toHaveLength(2);
    expect(nextState.activeWorkspaceId).not.toBe("ws-source");
    expect(nextState.tasks).toHaveLength(1);
    expect(nextState.tasks[0]?.title).toBe("Continue from feature/pr-status");
    expect(nextState.promptDraftByTask[nextState.tasks[0]?.id ?? ""]).toEqual({
      text: "",
      attachedFilePaths: [".stave/context/continued-from-feature-pr-status.md"],
      attachments: [],
    });
  });
});
