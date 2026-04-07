import { describe, expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import {
  resolvePromptDraftRuntimeState,
  transitionClaudePromptDraftPermissionMode,
} from "@/store/prompt-draft-runtime";

describe("prompt-draft runtime state", () => {
  test("prefers task-local runtime overrides over global fallbacks", () => {
    expect(resolvePromptDraftRuntimeState({
      promptDraft: {
        text: "Plan this fix",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides: {
          claudePermissionMode: "plan",
          claudePermissionModeBeforePlan: "acceptEdits",
          codexPlanMode: true,
        },
      },
      fallback: {
        claudePermissionMode: "default",
        claudePermissionModeBeforePlan: null,
        codexPlanMode: false,
      },
    })).toEqual({
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: "acceptEdits",
      codexPlanMode: true,
    });
  });

  test("restores the prior Claude permission mode when leaving plan mode", () => {
    expect(transitionClaudePromptDraftPermissionMode({
      nextMode: "acceptEdits",
      currentMode: "plan",
      beforePlan: "bypassPermissions",
    })).toEqual({
      claudePermissionMode: "acceptEdits",
      claudePermissionModeBeforePlan: null,
    });
  });

  test("parses persisted prompt draft runtime overrides from workspace snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-04-01T00:00:00.000Z",
          unread: false,
        }],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {
          "task-1": {
            text: "",
            attachedFilePaths: [],
            attachments: [],
            runtimeOverrides: {
              claudePermissionMode: "plan",
              claudePermissionModeBeforePlan: "acceptEdits",
              codexPlanMode: true,
            },
          },
        },
        providerSessionByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
      },
    });

    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides).toEqual({
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: "acceptEdits",
      codexPlanMode: true,
    });
  });
});
