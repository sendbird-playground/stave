import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import {
  generateFallbackPullRequestDraft,
  mergePullRequestDraft,
  resolvePullRequestTitle,
} from "../../../src/lib/source-control-pr";
import { providerRuntime } from "../../providers/runtime";
import {
  getClaudeContextUsage,
  reloadClaudePlugins,
  suggestClaudeTaskName,
  suggestClaudeCommitMessage,
  suggestClaudePRDescription,
} from "../../providers/claude-sdk-runtime";
import type { StreamTurnArgs } from "../../providers/types";
import {
  ApprovalResponseArgsSchema,
  ClaudeRuntimeActionArgsSchema,
  CheckAvailabilityArgsSchema,
  ConnectedToolStatusArgsSchema,
  CleanupTaskArgsSchema,
  ProviderCommandCatalogArgsSchema,
  StreamReadArgsSchema,
  StreamTurnArgsSchema,
  SuggestCommitMessageArgsSchema,
  SuggestPRDescriptionArgsSchema,
  SuggestTaskNameArgsSchema,
  UserInputResponseArgsSchema,
} from "./schemas";
import { ensurePersistenceReady } from "../state";
import { isDoneEvent, toEventType } from "../utils/provider-events";
import { quotePath, runCommand } from "../utils/command";

function formatSchemaIssuePath(path: PropertyKey[]) {
  if (path.length === 0) {
    return "(root)";
  }
  return path.map((segment) => String(segment)).join(".");
}

function formatSchemaFailureMessage(args: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
  fallback: string;
}) {
  const summary = args.issues
    .slice(0, 3)
    .map((issue) => `${formatSchemaIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  return summary.length > 0
    ? `IPC schema rejected provider request. ${summary}`
    : args.fallback;
}

export function registerProviderHandlers() {
  ipcMain.handle("provider:stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return [
        {
          type: "error",
          message: formatSchemaFailureMessage({
            issues: parsedArgs.error.issues,
            fallback: "IPC schema rejected provider request.",
          }),
          recoverable: false,
        },
        { type: "done" },
      ];
    }
    return providerRuntime.streamTurn(parsedArgs.data as StreamTurnArgs);
  });

  ipcMain.handle("provider:start-stream-turn", (_event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        streamId: "",
        message: formatSchemaFailureMessage({
          issues: parsedArgs.error.issues,
          fallback: "IPC schema rejected provider request.",
        }),
      };
    }
    return providerRuntime.startTurnStream(parsedArgs.data as StreamTurnArgs);
  });

  ipcMain.handle("provider:start-push-turn", async (event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        streamId: "",
        turnId: null,
        message: formatSchemaFailureMessage({
          issues: parsedArgs.error.issues,
          fallback: "IPC schema rejected provider request.",
        }),
      };
    }
    const safeArgs = parsedArgs.data as StreamTurnArgs;
    const turnId = safeArgs.turnId ?? randomUUID();
    const sender = event.sender;
    const store = await ensurePersistenceReady();
    let sequence = 0;
    let completed = false;

    if (safeArgs.taskId) {
      try {
        store.beginTurn({
          id: turnId,
          workspaceId: safeArgs.workspaceId ?? "default",
          taskId: safeArgs.taskId,
          providerId: safeArgs.providerId,
        });
      } catch (error) {
        console.warn("[provider:persistence] failed to begin turn", error, {
          turnId,
          providerId: safeArgs.providerId,
          taskId: safeArgs.taskId,
          workspaceId: safeArgs.workspaceId ?? null,
        });
      }

      try {
        store.appendTurnEvent({
          id: randomUUID(),
          turnId,
          sequence: 0,
          eventType: "request_snapshot",
          payload: {
            type: "request_snapshot",
            prompt: safeArgs.prompt,
            conversation: safeArgs.conversation ?? null,
          },
        });
      } catch (error) {
        console.warn("[provider:persistence] failed to append request snapshot", error, {
          turnId,
          providerId: safeArgs.providerId,
          taskId: safeArgs.taskId,
        });
      }
    }

    const started = providerRuntime.startTurnStream(safeArgs, {
      onEvent: (turnEvent) => {
        sequence += 1;
        if (safeArgs.taskId) {
          try {
            store.appendTurnEvent({
              id: randomUUID(),
              turnId,
              sequence,
              eventType: toEventType({ event: turnEvent }),
              payload: turnEvent,
            });
          } catch (error) {
            console.warn("[provider:persistence] failed to append turn event", error, {
              turnId,
              sequence,
              providerId: safeArgs.providerId,
              taskId: safeArgs.taskId,
              eventType: toEventType({ event: turnEvent }),
            });
          }
        }
        try {
          sender.send("provider:stream-event", {
            streamId: started.streamId,
            event: turnEvent,
            sequence,
            done: isDoneEvent({ event: turnEvent }),
            taskId: safeArgs.taskId ?? null,
            workspaceId: safeArgs.workspaceId ?? null,
            providerId: safeArgs.providerId,
            turnId: safeArgs.taskId ? turnId : null,
          });
        } catch (error) {
          console.warn("[provider:stream] failed to forward event to renderer", error, {
            turnId,
            sequence,
            providerId: safeArgs.providerId,
            taskId: safeArgs.taskId ?? null,
            eventType: toEventType({ event: turnEvent }),
          });
        }
      },
      onDone: () => {
        if (!completed && safeArgs.taskId) {
          completed = true;
          try {
            const completedAt = new Date().toISOString();
            store.completeTurn({ id: turnId, completedAt });
          } catch (error) {
            console.warn("[provider:persistence] failed to complete turn", error, {
              turnId,
              providerId: safeArgs.providerId,
              taskId: safeArgs.taskId,
            });
          }
        }
      },
    });

    return { ok: true, streamId: started.streamId, turnId: safeArgs.taskId ? turnId : null };
  });

  ipcMain.handle("provider:read-stream-turn", (_event, args: unknown) => {
    const parsedArgs = StreamReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, events: [], cursor: 0, done: true, message: "Invalid stream read request." };
    }
    return providerRuntime.readTurnStream(parsedArgs.data);
  });

  ipcMain.handle("provider:abort-turn", (_event, args: unknown) => {
    const turnId = (args as { turnId?: unknown })?.turnId;
    if (typeof turnId !== "string" || turnId.trim().length === 0) {
      return { ok: false, message: "Invalid provider abort request." };
    }
    return providerRuntime.abortTurn({ turnId });
  });

  ipcMain.handle("provider:cleanup-task", (_event, args: unknown) => {
    const parsedArgs = CleanupTaskArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid task cleanup request." };
    }
    return providerRuntime.cleanupTask({ taskId: parsedArgs.data.taskId });
  });

  ipcMain.handle("provider:respond-approval", (_event, args: unknown) => {
    const parsedArgs = ApprovalResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid approval response request." };
    }
    return providerRuntime.respondApproval({
      turnId: parsedArgs.data.turnId,
      requestId: parsedArgs.data.requestId,
      approved: parsedArgs.data.approved,
    });
  });

  ipcMain.handle("provider:respond-user-input", (_event, args: unknown) => {
    const parsedArgs = UserInputResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid user-input response request." };
    }
    return providerRuntime.respondUserInput({
      turnId: parsedArgs.data.turnId,
      requestId: parsedArgs.data.requestId,
      answers: parsedArgs.data.answers,
      denied: parsedArgs.data.denied,
    });
  });

  ipcMain.handle("provider:check-availability", (_event, args: unknown) => {
    const parsedArgs = CheckAvailabilityArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, available: false, detail: "Invalid provider availability request." };
    }
    return providerRuntime.checkAvailability(parsedArgs.data);
  });

  ipcMain.handle("provider:get-command-catalog", (_event, args: unknown) => {
    const parsedArgs = ProviderCommandCatalogArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail: "Invalid provider command catalog request.",
      };
    }
    return providerRuntime.getCommandCatalog({
      providerId: parsedArgs.data.providerId,
      cwd: parsedArgs.data.cwd,
      runtimeOptions: parsedArgs.data.runtimeOptions,
    });
  });

  ipcMain.handle("provider:get-connected-tool-status", (_event, args: unknown) => {
    const parsedArgs = ConnectedToolStatusArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        providerId: "stave" as const,
        detail: "Invalid connected-tool status request.",
        tools: [],
      };
    }
    return providerRuntime.getConnectedToolStatus(parsedArgs.data);
  });

  ipcMain.handle("provider:get-claude-context-usage", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Claude context usage request.",
      };
    }
    return getClaudeContextUsage({
      cwd: parsedArgs.data.cwd,
      runtimeOptions: parsedArgs.data.runtimeOptions,
    });
  });

  ipcMain.handle("provider:reload-claude-plugins", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Claude plugin reload request.",
      };
    }
    return reloadClaudePlugins({
      cwd: parsedArgs.data.cwd,
      runtimeOptions: parsedArgs.data.runtimeOptions,
    });
  });

  // Lightweight, single-turn query that returns a short title for a new task.
  // Runs isolated from the task's main conversation history.
  ipcMain.handle("provider:suggest-task-name", (_event, args: unknown) => {
    const parsed = SuggestTaskNameArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return suggestClaudeTaskName({ prompt: parsed.data.prompt, history: parsed.data.history });
  });

  // Lightweight, single-turn query that generates a conventional commit message
  // from the current git diff.  Runs isolated from any task conversation.
  ipcMain.handle("provider:suggest-commit-message", async (_event, args: unknown) => {
    const parsed = SuggestCommitMessageArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }

    const cwd = parsed.data.cwd;
    const [diffResult, statusResult] = await Promise.all([
      runCommand({ command: "git diff HEAD", cwd }),
      runCommand({ command: "git status --porcelain", cwd }),
    ]);

    const diff = diffResult.ok ? diffResult.stdout.trim() : "";
    const fileList = statusResult.ok ? statusResult.stdout.trim() : "";

    return suggestClaudeCommitMessage({ diff, fileList });
  });

  // Lightweight, single-turn query that generates a PR title and description
  // from the branch diff and commit log.
  ipcMain.handle("provider:suggest-pr-description", async (_event, args: unknown) => {
    const parsed = SuggestPRDescriptionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }

    const cwd = parsed.data.cwd;
    const baseBranch = parsed.data.baseBranch || "main";
    const safeBaseBranch = quotePath({ value: baseBranch });

    const [diffResult, workingTreeDiffResult, logResult, statResult, statusResult, guideResult] = await Promise.all([
      runCommand({ command: `git diff "${safeBaseBranch}"...HEAD`, cwd }),
      runCommand({ command: "git diff HEAD", cwd }),
      runCommand({ command: `git log "${safeBaseBranch}"..HEAD --pretty=format:"%h %s" --no-merges`, cwd }),
      runCommand({ command: `git diff "${safeBaseBranch}"...HEAD --stat`, cwd }),
      runCommand({ command: "git status --porcelain", cwd }),
      runCommand({ command: "cat AGENTS.md 2>/dev/null || cat .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || true", cwd }),
    ]);

    const branchResult = await runCommand({ command: "git rev-parse --abbrev-ref HEAD", cwd });

    const diff = diffResult.ok ? diffResult.stdout.trim() : "";
    const workingTreeDiff = workingTreeDiffResult.ok ? workingTreeDiffResult.stdout.trim() : "";
    const commitLog = logResult.ok ? logResult.stdout.trim() : "";
    const fileList = [
      statResult.ok ? statResult.stdout.trim() : "",
      statusResult.ok ? statusResult.stdout.trim() : "",
    ].filter(Boolean).join("\n");
    const guideContent = guideResult.ok ? guideResult.stdout.trim() : undefined;
    const headBranch = branchResult.ok ? branchResult.stdout.trim() : "HEAD";
    const fallbackDraft = generateFallbackPullRequestDraft({
      baseBranch,
      headBranch,
      commitLog,
      fileList,
    });

    const suggestion = await suggestClaudePRDescription({
      cwd,
      diff,
      workingTreeDiff,
      commitLog,
      fileList,
      baseBranch,
      headBranch,
      guideContent,
      promptTemplate: parsed.data.promptTemplate,
    });
    const mergedDraft = mergePullRequestDraft({
      fallbackTitle: fallbackDraft.title,
      fallbackBody: fallbackDraft.body,
      generatedTitle: suggestion.title,
      generatedBody: suggestion.body,
    });
    const resolvedTitle = resolvePullRequestTitle({
      currentTitle: mergedDraft.title,
      commitLog,
      headBranch,
    });

    return { ok: true, title: resolvedTitle, body: mergedDraft.body };
  });
}
