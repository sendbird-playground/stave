import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ChatMessage,
  ColiseumGroupState,
  ImageContextPart,
  MessagePart,
  PromptDraft,
  Task,
} from "@/types/chat";

import {
  buildMessageId,
  buildRecentTimestamp,
  createFileContextPart,
  createUserTextPart,
} from "@/store/chat-state-helpers";

/**
 * Pure helpers for the Coliseum feature (multi-model parallel turns).
 *
 * Why a dedicated module: keeping fan-out logic out of `app.store.ts` lets us
 * test the state transition without pulling in the whole Zustand store, and
 * makes the store-side action a thin orchestrator. Mirrors the pattern used
 * by `chat-state-helpers.ts` / `workspace-turn-replay.ts` / `task-turn-lifecycle.ts`.
 *
 * Scope: these helpers only build state patches — they do NOT dispatch provider
 * turns. Dispatch (calling `runProviderTurn`) is the caller's job; the patch
 * returned by `planColiseumFanOut` contains `branchDispatchList`, the per-branch
 * `{ taskId, turnId, provider, model }` tuples ready to hand off.
 */

/** Inclusive lower bound on branches per Coliseum. Below this there is no contest. */
export const MIN_COLISEUM_BRANCHES = 2;

/**
 * Inclusive upper bound on branches per Coliseum. Keeps the horizontal column
 * layout readable at typical window widths; anything larger is painful.
 */
export const MAX_COLISEUM_BRANCHES = 4;

/** A single entrant in a Coliseum fan-out. */
export interface ColiseumBranchSpec {
  provider: ProviderId;
  model: string;
  /** Optional pre-generated child taskId. Falls back to the supplied ID factory. */
  childTaskId?: string;
  /** Optional pre-generated child turnId. Falls back to the supplied ID factory. */
  turnId?: string;
}

/** Resolved, ready-to-dispatch per-branch target. */
export interface ColiseumBranchDispatch {
  taskId: string;
  turnId: string;
  provider: ProviderId;
  model: string;
}

export interface ColiseumFanOutInput {
  parentTask: Task;
  parentMessages: ChatMessage[];
  parentPromptDraft: PromptDraft | undefined;
  parentTaskWorkspaceId: string;
  branches: ColiseumBranchSpec[];
  content: string;
  fileContexts?: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>;
  imageContexts?: Array<{
    dataUrl: string;
    label: string;
    mimeType: string;
  }>;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createTaskId?: () => string;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  createTurnId?: () => string;
  /** Injected for deterministic tests. Defaults to ISO now. */
  now?: () => string;
}

export interface ColiseumFanOutResult {
  group: ColiseumGroupState;
  /** Child Task records to merge into state.tasks. */
  branchTasks: Task[];
  /** Per-child seeded messages (parent history + user msg + empty streaming assistant). */
  branchMessagesByTask: Record<string, ChatMessage[]>;
  branchMessageCountByTask: Record<string, number>;
  branchActiveTurnIdsByTask: Record<string, string>;
  branchProviderSessionByTask: Record<string, TaskProviderSessionState>;
  branchNativeSessionReadyByTask: Record<string, boolean>;
  branchPromptDraftByTask: Record<string, PromptDraft>;
  branchTaskWorkspaceIdById: Record<string, string>;
  /** One entry per branch in the same order as `input.branches`. */
  branchDispatchList: ColiseumBranchDispatch[];
}

function buildUserParts(args: {
  content: string;
  fileContexts?: ColiseumFanOutInput["fileContexts"];
  imageContexts?: ColiseumFanOutInput["imageContexts"];
}): MessagePart[] {
  const parts: MessagePart[] = [];
  if (args.fileContexts) {
    for (const fc of args.fileContexts) {
      parts.push(
        createFileContextPart({
          filePath: fc.filePath,
          content: fc.content,
          language: fc.language,
          instruction: fc.instruction,
        }),
      );
    }
  }
  if (args.imageContexts) {
    for (const ic of args.imageContexts) {
      parts.push({
        type: "image_context",
        dataUrl: ic.dataUrl,
        label: ic.label,
        mimeType: ic.mimeType,
      } satisfies ImageContextPart);
    }
  }
  if (args.content.trim().length > 0) {
    parts.push(createUserTextPart({ text: args.content }));
  }
  if (parts.length === 0) {
    parts.push(createUserTextPart({ text: args.content }));
  }
  return parts;
}

/**
 * Build the full state patch for starting a Coliseum. The caller applies the
 * returned fields via a single `set()` and then iterates `branchDispatchList`
 * to call `runProviderTurn` for each branch.
 *
 * Throws when the number of branches is out of range — caller should validate
 * first and show a user-facing error (the composer already enforces 2–4).
 */
export function planColiseumFanOut(input: ColiseumFanOutInput): ColiseumFanOutResult {
  if (input.branches.length < MIN_COLISEUM_BRANCHES) {
    throw new Error(
      `Coliseum requires at least ${MIN_COLISEUM_BRANCHES} branches (got ${input.branches.length}).`,
    );
  }
  if (input.branches.length > MAX_COLISEUM_BRANCHES) {
    throw new Error(
      `Coliseum allows at most ${MAX_COLISEUM_BRANCHES} branches (got ${input.branches.length}).`,
    );
  }

  const createTaskId = input.createTaskId ?? (() => crypto.randomUUID());
  const createTurnId = input.createTurnId ?? (() => crypto.randomUUID());
  const now = input.now ?? buildRecentTimestamp;

  const parentMessageCountAtFanout = input.parentMessages.length;
  const parentTitle = input.parentTask.title;
  const parentControlMode = input.parentTask.controlMode;
  const parentControlOwner = input.parentTask.controlOwner;

  // Precompute user message parts ONCE — identical across branches.
  const userParts = buildUserParts({
    content: input.content,
    fileContexts: input.fileContexts,
    imageContexts: input.imageContexts,
  });

  const branchTasks: Task[] = [];
  const branchMessagesByTask: Record<string, ChatMessage[]> = {};
  const branchMessageCountByTask: Record<string, number> = {};
  const branchActiveTurnIdsByTask: Record<string, string> = {};
  const branchProviderSessionByTask: Record<string, TaskProviderSessionState> = {};
  const branchNativeSessionReadyByTask: Record<string, boolean> = {};
  const branchPromptDraftByTask: Record<string, PromptDraft> = {};
  const branchTaskWorkspaceIdById: Record<string, string> = {};
  const branchDispatchList: ColiseumBranchDispatch[] = [];
  const branchTaskIds: string[] = [];

  for (const branch of input.branches) {
    const childTaskId = branch.childTaskId ?? createTaskId();
    const turnId = branch.turnId ?? createTurnId();
    branchTaskIds.push(childTaskId);

    const childTask: Task = {
      id: childTaskId,
      title: parentTitle,
      provider: branch.provider,
      updatedAt: now(),
      unread: false,
      archivedAt: null,
      controlMode: parentControlMode,
      controlOwner: parentControlOwner,
      coliseumParentTaskId: input.parentTask.id,
    };
    branchTasks.push(childTask);

    const userMessage: ChatMessage = {
      id: buildMessageId({ taskId: childTaskId, count: parentMessageCountAtFanout }),
      role: "user",
      model: "user",
      providerId: "user",
      content: input.content,
      // Clone parts so each branch owns its own array (cheap; parts themselves are plain data).
      parts: userParts.map((part) => ({ ...part })),
    };

    const assistantMessage: ChatMessage = {
      id: buildMessageId({ taskId: childTaskId, count: parentMessageCountAtFanout + 1 }),
      role: "assistant",
      model: branch.model,
      providerId: branch.provider,
      content: "",
      startedAt: now(),
      isStreaming: true,
      parts: [],
    };

    const nextMessages = [...input.parentMessages, userMessage, assistantMessage];
    branchMessagesByTask[childTaskId] = nextMessages;
    branchMessageCountByTask[childTaskId] = nextMessages.length;
    branchActiveTurnIdsByTask[childTaskId] = turnId;
    branchProviderSessionByTask[childTaskId] = {};
    branchNativeSessionReadyByTask[childTaskId] = false;
    branchTaskWorkspaceIdById[childTaskId] = input.parentTaskWorkspaceId;

    // Seed the branch's prompt draft with the parent's runtime overrides (permission
    // mode, plan mode) so the branch runs under the same mode preset as the parent.
    // The user explicitly confirmed: "probably all-auto is fine" — inheriting the
    // parent's current overrides is the minimal surprise choice. Branch-specific
    // model is set here; the user's prompt text is not re-staged in the draft
    // because the prompt is already materialized in messagesByTask.
    const parentOverrides = input.parentPromptDraft?.runtimeOverrides;
    branchPromptDraftByTask[childTaskId] = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: parentOverrides
        ? { ...parentOverrides, model: branch.model }
        : { model: branch.model },
    };

    branchDispatchList.push({
      taskId: childTaskId,
      turnId,
      provider: branch.provider,
      model: branch.model,
    });
  }

  const group: ColiseumGroupState = {
    parentTaskId: input.parentTask.id,
    branchTaskIds,
    createdAt: now(),
    parentMessageCountAtFanout,
  };

  return {
    group,
    branchTasks,
    branchMessagesByTask,
    branchMessageCountByTask,
    branchActiveTurnIdsByTask,
    branchProviderSessionByTask,
    branchNativeSessionReadyByTask,
    branchPromptDraftByTask,
    branchTaskWorkspaceIdById,
    branchDispatchList,
  };
}

/**
 * Validate branches before calling `planColiseumFanOut`. Returns null on success
 * or a user-facing error message. Kept pure so the composer can pre-check and
 * disable the submit button.
 */
export function validateColiseumBranches(
  branches: ColiseumBranchSpec[],
): string | null {
  if (branches.length < MIN_COLISEUM_BRANCHES) {
    return `Pick at least ${MIN_COLISEUM_BRANCHES} models for the Coliseum.`;
  }
  if (branches.length > MAX_COLISEUM_BRANCHES) {
    return `Coliseum supports at most ${MAX_COLISEUM_BRANCHES} models.`;
  }
  for (const branch of branches) {
    if (!branch.provider || !branch.model) {
      return "Every Coliseum entrant needs a provider and a model.";
    }
  }
  return null;
}

export interface PromoteColiseumChampionInput {
  group: ColiseumGroupState;
  championTaskId: string;
  /** Parent task's message history at promotion time. */
  parentMessages: ChatMessage[];
  /** Champion branch's full message history (parent prefix + branch turn). */
  championMessages: ChatMessage[];
}

export interface PromoteColiseumChampionResult {
  /** New parent messages: parent history + champion's post-fan-out tail, with IDs rewritten to the parent task id. */
  nextParentMessages: ChatMessage[];
  /** Count of messages appended from the champion (tail length). */
  appendedFromChampion: number;
  /** Child task ids that must be dropped (all branches, including champion). */
  branchTaskIdsToDrop: string[];
}

/**
 * Compute the parent-side state patch for promoting a champion. Pure helper so
 * the lifecycle can be tested without the store.
 *
 * Key invariant: the champion's first `parentMessageCountAtFanout` messages
 * are verbatim copies of the parent's history at fan-out time. Everything past
 * that index is the branch's own user message + assistant response (plus any
 * follow-up churn). We graft the tail onto the parent, rewriting message IDs
 * so they are keyed by the parent task id and contiguous with the existing
 * `parentMessages` length.
 */
export function promoteColiseumChampion(
  input: PromoteColiseumChampionInput,
): PromoteColiseumChampionResult {
  const { group, championTaskId, parentMessages, championMessages } = input;
  if (!group.branchTaskIds.includes(championTaskId)) {
    throw new Error(
      `Champion taskId ${championTaskId} is not a branch of group ${group.parentTaskId}.`,
    );
  }
  const { parentTaskId, parentMessageCountAtFanout } = group;
  const championTail = championMessages.slice(parentMessageCountAtFanout);
  const rewrittenTail: ChatMessage[] = championTail.map((msg, index) => ({
    ...msg,
    id: `${parentTaskId}-m-${parentMessages.length + index + 1}`,
    parts: msg.parts.map((part) => ({ ...part })),
  }));
  return {
    nextParentMessages: [...parentMessages, ...rewrittenTail],
    appendedFromChampion: rewrittenTail.length,
    branchTaskIdsToDrop: group.branchTaskIds.slice(),
  };
}

/**
 * Compute the state patch for removing a set of branch tasks entirely. Used by
 * `pickColiseumChampion` (after grafting the champion), `closeColiseumBranch`,
 * and `dismissColiseum`. Caller is responsible for also calling
 * `cleanupTask({ taskId })` on the provider IPC side to evict runtime caches.
 */
export function stripColiseumBranchesFromRecords<
  T extends Record<string, unknown>,
>(record: T, branchTaskIds: string[]): T {
  if (branchTaskIds.length === 0) {
    return record;
  }
  const branchSet = new Set(branchTaskIds);
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (branchSet.has(key)) {
      changed = true;
      continue;
    }
    next[key] = record[key];
  }
  return (changed ? next : record) as T;
}

export interface ReapColiseumOrphansInput {
  tasks: Task[];
  /** Runtime group state keyed by parent task id. Freshly empty on bootstrap. */
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
}

export interface ReapColiseumOrphansResult {
  /** Tasks with orphan branches removed. Same reference when there are none. */
  tasks: Task[];
  /** Branch task ids that were dropped (callers use this to strip message maps). */
  orphanedBranchTaskIds: string[];
}

/**
 * Identify Coliseum branch tasks whose parent group no longer exists in runtime
 * state, and remove them. Called when a workspace snapshot is loaded from disk:
 * `activeColiseumsByTask` is always empty on bootstrap (runtime-only), so every
 * persisted branch task is an orphan. Keeping the helper generic (compares to
 * `activeColiseumsByTask`) makes it reusable mid-session if we ever need to
 * reap after a partial state restore.
 */
export function reapColiseumOrphans(
  input: ReapColiseumOrphansInput,
): ReapColiseumOrphansResult {
  const liveGroupBranchIds = new Set<string>();
  for (const group of Object.values(input.activeColiseumsByTask)) {
    if (!group) continue;
    for (const branchId of group.branchTaskIds) {
      liveGroupBranchIds.add(branchId);
    }
  }
  const orphanedBranchTaskIds: string[] = [];
  const keptTasks = input.tasks.filter((task) => {
    if (!task.coliseumParentTaskId) return true;
    if (liveGroupBranchIds.has(task.id)) return true;
    orphanedBranchTaskIds.push(task.id);
    return false;
  });
  if (orphanedBranchTaskIds.length === 0) {
    return { tasks: input.tasks, orphanedBranchTaskIds };
  }
  return { tasks: keptTasks, orphanedBranchTaskIds };
}
