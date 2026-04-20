import { describe, expect, test } from "bun:test";
import {
  MAX_COLISEUM_BRANCHES,
  MIN_COLISEUM_BRANCHES,
  planColiseumFanOut,
  promoteColiseumChampion,
  reapColiseumOrphans,
  stripColiseumBranchesFromRecords,
  validateColiseumBranches,
  type ColiseumBranchSpec,
} from "@/store/coliseum.utils";
import { isColiseumBranch, getVisibleTasks } from "@/lib/tasks";
import type {
  ChatMessage,
  ColiseumGroupState,
  PromptDraft,
  Task,
} from "@/types/chat";

function createParentTask(): Task {
  return {
    id: "task-parent",
    title: "Example task",
    provider: "claude-code",
    updatedAt: "2026-04-20T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
  };
}

function createHistory(): ChatMessage[] {
  return [
    {
      id: "task-parent-m-1",
      role: "user",
      model: "user",
      providerId: "user",
      content: "first prompt",
      parts: [{ type: "text", text: "first prompt" }],
    },
    {
      id: "task-parent-m-2",
      role: "assistant",
      model: "claude-sonnet-4-6",
      providerId: "claude-code",
      content: "first answer",
      parts: [{ type: "text", text: "first answer" }],
    },
  ];
}

function sequentialIdFactory(prefix: string) {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

const deterministicNow = () => "2026-04-20T12:00:00.000Z";

describe("planColiseumFanOut", () => {
  test("creates a child task per branch with coliseumParentTaskId set", () => {
    const branches: ColiseumBranchSpec[] = [
      { provider: "claude-code", model: "claude-sonnet-4-6" },
      { provider: "codex", model: "gpt-5.4" },
      { provider: "stave", model: "stave-auto" },
    ];

    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches,
      content: "compare these models",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchTasks).toHaveLength(3);
    expect(result.branchTasks.map((task) => task.id)).toEqual([
      "child-1",
      "child-2",
      "child-3",
    ]);
    for (const child of result.branchTasks) {
      expect(child.coliseumParentTaskId).toBe("task-parent");
      expect(child.archivedAt).toBe(null);
      expect(child.controlMode).toBe("interactive");
      expect(child.controlOwner).toBe("stave");
    }
    expect(result.branchTasks[0]?.provider).toBe("claude-code");
    expect(result.branchTasks[1]?.provider).toBe("codex");
    expect(result.branchTasks[2]?.provider).toBe("stave");
  });

  test("populates the group state with parent id and fan-out snapshot index", () => {
    const history = createHistory();
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: history,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.group.parentTaskId).toBe("task-parent");
    expect(result.group.branchTaskIds).toEqual(["child-1", "child-2"]);
    expect(result.group.parentMessageCountAtFanout).toBe(history.length);
    expect(result.group.createdAt).toBe("2026-04-20T12:00:00.000Z");
  });

  test("seeds each branch's message list with parent history + user msg + empty streaming assistant", () => {
    const history = createHistory();
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: history,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "new prompt",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    const firstBranch = result.branchMessagesByTask["child-1"];
    expect(firstBranch).toBeDefined();
    expect(firstBranch?.length).toBe(history.length + 2);

    // Parent history preserved verbatim at the start.
    expect(firstBranch?.[0]).toEqual(history[0]!);
    expect(firstBranch?.[1]).toEqual(history[1]!);

    const userMsg = firstBranch?.[history.length];
    expect(userMsg?.role).toBe("user");
    expect(userMsg?.content).toBe("new prompt");

    const assistantMsg = firstBranch?.[history.length + 1];
    expect(assistantMsg?.role).toBe("assistant");
    expect(assistantMsg?.isStreaming).toBe(true);
    expect(assistantMsg?.content).toBe("");
    expect(assistantMsg?.model).toBe("claude-sonnet-4-6");
    expect(assistantMsg?.providerId).toBe("claude-code");
    expect(assistantMsg?.parts).toEqual([]);

    // The second branch gets its own model on the streaming assistant.
    const secondAssistant =
      result.branchMessagesByTask["child-2"]?.[history.length + 1];
    expect(secondAssistant?.model).toBe("gpt-5.4");
    expect(secondAssistant?.providerId).toBe("codex");
  });

  test("wires active turn ids + fresh provider session + native session flags per branch", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchActiveTurnIdsByTask).toEqual({
      "child-1": "turn-1",
      "child-2": "turn-2",
    });
    expect(result.branchProviderSessionByTask).toEqual({
      "child-1": {},
      "child-2": {},
    });
    expect(result.branchNativeSessionReadyByTask).toEqual({
      "child-1": false,
      "child-2": false,
    });
    expect(result.branchTaskWorkspaceIdById).toEqual({
      "child-1": "worktree:abc",
      "child-2": "worktree:abc",
    });
  });

  test("dispatch list matches branch input order with resolved ids", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "codex", model: "gpt-5.4" },
        { provider: "claude-code", model: "claude-sonnet-4-6" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchDispatchList).toEqual([
      { taskId: "child-1", turnId: "turn-1", provider: "codex", model: "gpt-5.4" },
      {
        taskId: "child-2",
        turnId: "turn-2",
        provider: "claude-code",
        model: "claude-sonnet-4-6",
      },
    ]);
  });

  test("inherits runtime overrides from parent's prompt draft and pins branch-specific model", () => {
    const parentDraft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: {
        claudePermissionMode: "acceptEdits",
        codexPlanMode: true,
        model: "claude-sonnet-4-6",
      },
    };

    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: parentDraft,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-opus-4-5" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    // First branch preserves parent's Claude permission mode + pins its own model.
    expect(result.branchPromptDraftByTask["child-1"]?.runtimeOverrides).toEqual({
      claudePermissionMode: "acceptEdits",
      codexPlanMode: true,
      model: "claude-opus-4-5",
    });
    // Second branch pins its own model while inheriting the same overrides.
    expect(result.branchPromptDraftByTask["child-2"]?.runtimeOverrides).toEqual({
      claudePermissionMode: "acceptEdits",
      codexPlanMode: true,
      model: "gpt-5.4",
    });
  });

  test("falls back to a fresh draft when parent has no prompt draft", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchPromptDraftByTask["child-1"]).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: { model: "claude-sonnet-4-6" },
    });
  });

  test("does not mutate parent messages or add messages to the parent task", () => {
    const history = createHistory();
    const frozenHistoryCopy = JSON.parse(JSON.stringify(history));

    planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: history,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    // Parent history is read, not mutated.
    expect(history).toEqual(frozenHistoryCopy);
  });

  test("file + image contexts are attached to the user message of every branch", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "explain this file",
      fileContexts: [
        {
          filePath: "src/foo.ts",
          content: "export const foo = 1;",
          language: "typescript",
        },
      ],
      imageContexts: [
        {
          dataUrl: "data:image/png;base64,AAAA",
          label: "diagram.png",
          mimeType: "image/png",
        },
      ],
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    for (const taskId of ["child-1", "child-2"]) {
      const userMsg = result.branchMessagesByTask[taskId]?.[2];
      expect(userMsg).toBeDefined();
      const partTypes = userMsg?.parts.map((p) => p.type);
      expect(partTypes).toEqual(["file_context", "image_context", "text"]);
    }
  });

  test("throws below MIN_COLISEUM_BRANCHES or above MAX_COLISEUM_BRANCHES", () => {
    const baseArgs = {
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    };

    expect(() =>
      planColiseumFanOut({
        ...baseArgs,
        branches: [{ provider: "claude-code", model: "claude-sonnet-4-6" }],
      }),
    ).toThrow(`Coliseum requires at least ${MIN_COLISEUM_BRANCHES} branches`);

    expect(() =>
      planColiseumFanOut({
        ...baseArgs,
        branches: Array.from({ length: MAX_COLISEUM_BRANCHES + 1 }, (_, i) => ({
          provider: "claude-code" as const,
          model: `model-${i}`,
        })),
      }),
    ).toThrow(`Coliseum allows at most ${MAX_COLISEUM_BRANCHES} branches`);
  });
});

describe("validateColiseumBranches", () => {
  test("accepts exactly MIN and MAX branches", () => {
    const min: ColiseumBranchSpec[] = Array.from(
      { length: MIN_COLISEUM_BRANCHES },
      (_, i) => ({ provider: "claude-code", model: `m${i}` }),
    );
    const max: ColiseumBranchSpec[] = Array.from(
      { length: MAX_COLISEUM_BRANCHES },
      (_, i) => ({ provider: "claude-code", model: `m${i}` }),
    );
    expect(validateColiseumBranches(min)).toBeNull();
    expect(validateColiseumBranches(max)).toBeNull();
  });

  test("rejects too few or too many branches", () => {
    expect(validateColiseumBranches([])).toMatch(/at least/);
    expect(
      validateColiseumBranches([{ provider: "claude-code", model: "x" }]),
    ).toMatch(/at least/);
    expect(
      validateColiseumBranches(
        Array.from({ length: MAX_COLISEUM_BRANCHES + 1 }, () => ({
          provider: "claude-code" as const,
          model: "x",
        })),
      ),
    ).toMatch(/at most/);
  });

  test("rejects a branch missing provider or model", () => {
    expect(
      validateColiseumBranches([
        { provider: "claude-code", model: "x" },
        { provider: "codex", model: "" },
      ]),
    ).toMatch(/provider and a model/);
  });
});

describe("Coliseum branches stay hidden from task-tree surfaces", () => {
  test("isColiseumBranch + getVisibleTasks filter branches by default", () => {
    const parent = createParentTask();
    const result = planColiseumFanOut({
      parentTask: parent,
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    for (const child of result.branchTasks) {
      expect(isColiseumBranch(child)).toBe(true);
    }

    const allTasks: Task[] = [parent, ...result.branchTasks];
    const visibleActive = getVisibleTasks({ tasks: allTasks, filter: "active" });
    expect(visibleActive).toEqual([parent]);

    const visibleAll = getVisibleTasks({ tasks: allTasks, filter: "all" });
    expect(visibleAll).toEqual([parent]);

    const visibleWithBranches = getVisibleTasks({
      tasks: allTasks,
      filter: "all",
      includeColiseumBranches: true,
    });
    expect(visibleWithBranches.length).toBe(allTasks.length);
  });
});

describe("promoteColiseumChampion", () => {
  function buildGroup(): ColiseumGroupState {
    return {
      parentTaskId: "task-parent",
      branchTaskIds: ["child-1", "child-2"],
      createdAt: "2026-04-20T12:00:00.000Z",
      parentMessageCountAtFanout: 2,
    };
  }

  function buildChampionMessages(): ChatMessage[] {
    // Indices 0-1 are parent history copies; indices 2+ are the branch's own
    // user message + streaming assistant response (plus any churn).
    return [
      {
        id: "child-1-m-1",
        role: "user",
        model: "user",
        providerId: "user",
        content: "first prompt",
        parts: [{ type: "text", text: "first prompt" }],
      },
      {
        id: "child-1-m-2",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "first answer",
        parts: [{ type: "text", text: "first answer" }],
      },
      {
        id: "child-1-m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "compare prompt",
        parts: [{ type: "text", text: "compare prompt" }],
      },
      {
        id: "child-1-m-4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "champion answer",
        parts: [{ type: "text", text: "champion answer" }],
      },
    ];
  }

  test("appends only the champion's post-fan-out tail with rewritten IDs", () => {
    const group = buildGroup();
    const parentMessages = createHistory();
    const result = promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages,
      championMessages: buildChampionMessages(),
    });

    expect(result.appendedFromChampion).toBe(2);
    expect(result.nextParentMessages).toHaveLength(parentMessages.length + 2);
    // Parent prefix unchanged (same object references are fine).
    expect(result.nextParentMessages[0]).toEqual(parentMessages[0]!);
    expect(result.nextParentMessages[1]).toEqual(parentMessages[1]!);
    // Grafted messages are keyed to the parent task id, sequentially numbered
    // from `parentMessages.length + 1`.
    expect(result.nextParentMessages[2]?.id).toBe("task-parent-m-3");
    expect(result.nextParentMessages[3]?.id).toBe("task-parent-m-4");
    expect(result.nextParentMessages[2]?.content).toBe("compare prompt");
    expect(result.nextParentMessages[3]?.content).toBe("champion answer");
    // Branches including champion are queued for removal.
    expect(result.branchTaskIdsToDrop).toEqual(["child-1", "child-2"]);
  });

  test("does not mutate the input parent messages or champion messages", () => {
    const group = buildGroup();
    const parentMessages = createHistory();
    const champion = buildChampionMessages();
    const parentSnapshot = JSON.parse(JSON.stringify(parentMessages));
    const championSnapshot = JSON.parse(JSON.stringify(champion));

    promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages,
      championMessages: champion,
    });

    expect(parentMessages).toEqual(parentSnapshot);
    expect(champion).toEqual(championSnapshot);
  });

  test("throws when championTaskId is not a branch of the group", () => {
    expect(() =>
      promoteColiseumChampion({
        group: buildGroup(),
        championTaskId: "unrelated",
        parentMessages: createHistory(),
        championMessages: buildChampionMessages(),
      }),
    ).toThrow(/not a branch/);
  });

  test("appendedFromChampion is zero when champion has no post-fan-out messages", () => {
    const group = buildGroup();
    const result = promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages: createHistory(),
      // Champion only has the parent prefix — no branch turn yet.
      championMessages: createHistory(),
    });
    expect(result.appendedFromChampion).toBe(0);
    expect(result.nextParentMessages).toHaveLength(createHistory().length);
  });
});

describe("reapColiseumOrphans", () => {
  function makeTask(id: string, coliseumParentTaskId?: string): Task {
    return {
      id,
      title: id,
      provider: "claude-code",
      updatedAt: "2026-04-20T00:00:00.000Z",
      unread: false,
      archivedAt: null,
      controlMode: "interactive",
      controlOwner: "stave",
      ...(coliseumParentTaskId ? { coliseumParentTaskId } : {}),
    };
  }

  test("removes branch tasks when no group references them", () => {
    const parent = makeTask("parent");
    const branchA = makeTask("branch-a", "parent");
    const branchB = makeTask("branch-b", "parent");
    const result = reapColiseumOrphans({
      tasks: [parent, branchA, branchB],
      activeColiseumsByTask: {},
    });
    expect(result.tasks).toEqual([parent]);
    expect(result.orphanedBranchTaskIds).toEqual(["branch-a", "branch-b"]);
  });

  test("keeps branches that are still in an active group", () => {
    const parent = makeTask("parent");
    const branchA = makeTask("branch-a", "parent");
    const branchB = makeTask("branch-b", "parent");
    const result = reapColiseumOrphans({
      tasks: [parent, branchA, branchB],
      activeColiseumsByTask: {
        parent: {
          parentTaskId: "parent",
          branchTaskIds: ["branch-a", "branch-b"],
          createdAt: "2026-04-20T00:00:00.000Z",
          parentMessageCountAtFanout: 0,
        },
      },
    });
    expect(result.tasks).toEqual([parent, branchA, branchB]);
    expect(result.orphanedBranchTaskIds).toEqual([]);
  });

  test("returns the same tasks reference when there are no orphans", () => {
    const parent = makeTask("parent");
    const tasks = [parent];
    const result = reapColiseumOrphans({
      tasks,
      activeColiseumsByTask: {},
    });
    expect(result.tasks).toBe(tasks);
    expect(result.orphanedBranchTaskIds).toEqual([]);
  });

  test("mixed orphaned + live branches are partitioned correctly", () => {
    const parent = makeTask("parent");
    const liveBranch = makeTask("live-branch", "parent");
    const orphanBranch = makeTask("orphan-branch", "gone-parent");
    const result = reapColiseumOrphans({
      tasks: [parent, liveBranch, orphanBranch],
      activeColiseumsByTask: {
        parent: {
          parentTaskId: "parent",
          branchTaskIds: ["live-branch"],
          createdAt: "2026-04-20T00:00:00.000Z",
          parentMessageCountAtFanout: 0,
        },
      },
    });
    expect(result.tasks).toEqual([parent, liveBranch]);
    expect(result.orphanedBranchTaskIds).toEqual(["orphan-branch"]);
  });
});

describe("Coliseum lifecycle end-to-end (pure helpers)", () => {
  // These tests thread the helper chain the way the store action does, without
  // touching `app.store.ts`. They guarantee the three pure helpers compose
  // correctly across the fan-out → promote → cleanup boundary, which is where
  // regressions would otherwise only surface as live runtime bugs.

  function runFanOut() {
    return planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
        { provider: "stave", model: "stave-auto" },
      ],
      content: "compare these",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });
  }

  test("branch taskIds + turnIds are all unique across concurrent branches", () => {
    const plan = runFanOut();
    const taskIds = plan.branchDispatchList.map((d) => d.taskId);
    const turnIds = plan.branchDispatchList.map((d) => d.turnId);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(new Set(turnIds).size).toBe(turnIds.length);
    // Per-branch message maps share no keys with each other.
    expect(new Set(Object.keys(plan.branchMessagesByTask)).size).toBe(
      plan.branchTasks.length,
    );
  });

  test("promotion + record stripping produces a clean parent-only state", () => {
    const plan = runFanOut();

    // Simulate the champion branch appending a response after fan-out.
    const championTaskId = plan.branchDispatchList[1]!.taskId;
    const championPriorMessages = plan.branchMessagesByTask[championTaskId]!;
    // Replace streaming assistant with a completed one.
    const championMessages: ChatMessage[] = championPriorMessages.map((msg, idx) => {
      if (idx === championPriorMessages.length - 1 && msg.role === "assistant") {
        return {
          ...msg,
          isStreaming: false,
          content: "codex champion answer",
          parts: [{ type: "text", text: "codex champion answer" }],
        };
      }
      return msg;
    });

    const parentMessages = createHistory();
    const promotion = promoteColiseumChampion({
      group: plan.group,
      championTaskId,
      parentMessages,
      championMessages,
    });

    // Parent gained exactly the post-fan-out tail (user msg + assistant).
    expect(promotion.appendedFromChampion).toBe(2);
    expect(promotion.branchTaskIdsToDrop.sort()).toEqual(
      plan.branchDispatchList.map((d) => d.taskId).sort(),
    );

    // Strip branch entries from downstream maps like the store does.
    const messagesByTaskAfter = stripColiseumBranchesFromRecords(
      {
        "task-parent": parentMessages,
        ...plan.branchMessagesByTask,
      },
      promotion.branchTaskIdsToDrop,
    );
    expect(Object.keys(messagesByTaskAfter)).toEqual(["task-parent"]);

    const activeTurnsAfter = stripColiseumBranchesFromRecords(
      { ...plan.branchActiveTurnIdsByTask },
      promotion.branchTaskIdsToDrop,
    );
    expect(activeTurnsAfter).toEqual({});

    // Reap any leftover branch task records — there should be no orphans
    // because the store clears the group along with the branches.
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      activeColiseumsByTask: {},
    });
    expect(reapResult.tasks).toEqual([]);
    expect(reapResult.orphanedBranchTaskIds.sort()).toEqual(
      plan.branchTasks.map((t) => t.id).sort(),
    );
  });

  test("dismissing the arena without picking a champion also cleans up", () => {
    const plan = runFanOut();
    const strippedMessages = stripColiseumBranchesFromRecords(
      plan.branchMessagesByTask,
      plan.group.branchTaskIds,
    );
    expect(strippedMessages).toEqual({});

    // Post-dismiss: branches must be reapable from the task list even if they
    // were never promoted.
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      activeColiseumsByTask: {},
    });
    expect(reapResult.tasks).toHaveLength(0);
  });

  test("closing one branch leaves the group and the survivors intact", () => {
    const plan = runFanOut();
    const [killed, ...survivors] = plan.branchTasks;
    expect(killed).toBeDefined();
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      // The group now only tracks the surviving branches.
      activeColiseumsByTask: {
        "task-parent": {
          ...plan.group,
          branchTaskIds: survivors.map((s) => s.id),
        },
      },
    });
    expect(reapResult.tasks).toEqual(survivors);
    expect(reapResult.orphanedBranchTaskIds).toEqual([killed!.id]);
  });
});

describe("stripColiseumBranchesFromRecords", () => {
  test("removes listed keys and preserves the rest", () => {
    const record = {
      "task-parent": 1,
      "child-1": 2,
      "child-2": 3,
    };
    const next = stripColiseumBranchesFromRecords(record, [
      "child-1",
      "child-2",
    ]);
    expect(next).toEqual({ "task-parent": 1 });
  });

  test("returns the same reference when no keys match", () => {
    const record = { a: 1, b: 2 };
    const next = stripColiseumBranchesFromRecords(record, ["missing"]);
    expect(next).toBe(record);
  });

  test("returns the same reference when the branch list is empty", () => {
    const record = { a: 1 };
    expect(stripColiseumBranchesFromRecords(record, [])).toBe(record);
  });
});
