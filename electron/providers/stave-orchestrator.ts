/**
 * Stave Auto orchestrator.
 *
 * The supervisor produces role-based subtasks. Stave resolves each role to the
 * configured model from the Stave Auto profile at execution time so settings
 * remain the single source of truth.
 */

import type { BridgeEvent, StreamTurnArgs } from "./types";
import type { ProviderRuntimeOptions, StaveAutoProfile, StaveWorkerRole } from "../../src/lib/providers/provider.types";
import {
  resolveStaveProviderForModel,
  resolveStaveWorkerModel,
} from "../../src/lib/providers/stave-auto-profile";

interface SubtaskSpec {
  id: string;
  title: string;
  role: StaveWorkerRole;
  prompt: string;
  dependsOn: string[];
}

function buildSupervisorBreakdownPrompt(args: {
  profile: StaveAutoProfile;
}) {
  const providerNote = args.profile.allowCrossProviderWorkers
    ? "Cross-provider workers are allowed."
    : "Avoid plans that require mixing providers; prefer fewer, broader subtasks.";

  return `You are the Stave Auto orchestration supervisor.
Break the user's request into 1-${args.profile.maxSubtasks} focused subtasks.

Available worker roles:
- "plan": strategy or high-level design only
- "analyze": explain, inspect, debug, review, root-cause analysis
- "implement": write, patch, refactor, add tests
- "verify": validate the implementation, inspect risks, sanity-check tests
- "general": balanced fallback when another role is not a clean fit

${providerNote}

Return ONLY a JSON array:
[
  {"id":"st-1","title":"Analyse existing code","role":"analyze","prompt":"...","dependsOn":[]},
  {"id":"st-2","title":"Implement fix","role":"implement","prompt":"Based on analysis: {st-1}\\n\\n...","dependsOn":["st-1"]}
]

Rules:
- Keep subtasks focused and concrete
- Prefer 2-3 subtasks unless one is enough
- Use {id} placeholders to reference earlier results
- Use "verify" only when an explicit validation/review step is helpful`;
}

const SUPERVISOR_SYNTHESIS_PROMPT = `You are the Stave Auto synthesis supervisor.
Multiple workers completed focused subtasks. Produce one coherent final response.
Be concise and avoid repeating every intermediate detail verbatim.`;

function parseSubtaskSpec(args: {
  raw: string;
  maxSubtasks: number;
}): SubtaskSpec[] | null {
  const cleaned = args.raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const subtasks: SubtaskSpec[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object"
        || item === null
        || typeof item.id !== "string"
        || typeof item.title !== "string"
        || typeof item.role !== "string"
        || typeof item.prompt !== "string"
      ) {
        return null;
      }

      const role = item.role;
      if (
        role !== "plan"
        && role !== "analyze"
        && role !== "implement"
        && role !== "verify"
        && role !== "general"
      ) {
        return null;
      }

      const dependsOn = Array.isArray(item.dependsOn)
        ? (item.dependsOn as unknown[]).filter((dep): dep is string => typeof dep === "string")
        : [];

      subtasks.push({
        id: item.id,
        title: item.title,
        role,
        prompt: item.prompt,
        dependsOn,
      });
    }

    return subtasks.slice(0, args.maxSubtasks);
  } catch {
    return null;
  }
}

function topologicalGroups(subtasks: SubtaskSpec[]): SubtaskSpec[][] {
  const idToLevel = new Map<string, number>();
  const allIds = new Set(subtasks.map((subtask) => subtask.id));

  function getLevel(id: string): number {
    if (idToLevel.has(id)) {
      return idToLevel.get(id)!;
    }
    const task = subtasks.find((subtask) => subtask.id === id);
    if (!task) {
      return 0;
    }
    const validDeps = task.dependsOn.filter((dep) => allIds.has(dep));
    if (validDeps.length === 0) {
      idToLevel.set(id, 0);
      return 0;
    }
    const level = Math.max(...validDeps.map(getLevel)) + 1;
    idToLevel.set(id, level);
    return level;
  }

  for (const subtask of subtasks) {
    getLevel(subtask.id);
  }

  const maxLevel = Math.max(0, ...Array.from(idToLevel.values()));
  const groups: SubtaskSpec[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const subtask of subtasks) {
    groups[idToLevel.get(subtask.id) ?? 0]!.push(subtask);
  }

  return groups.filter((group) => group.length > 0);
}

function extractTextFromEvents(events: BridgeEvent[]): string {
  return events
    .filter((event): event is Extract<BridgeEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.text)
    .join("");
}

function buildSingleTurnPrompt(args: {
  providerId: "claude-code" | "codex";
  systemPrompt: string;
  prompt: string;
}) {
  if (args.providerId === "codex") {
    return `<system>\n${args.systemPrompt}\n</system>\n\n${args.prompt}`;
  }
  return args.prompt;
}

function buildSingleTurnRuntimeOptions(args: {
  providerId: "claude-code" | "codex";
  model: string;
  systemPrompt: string;
  timeoutMs: number;
}): ProviderRuntimeOptions {
  return {
    model: args.model,
    ...(args.providerId === "claude-code"
      ? {
          claudeSystemPrompt: args.systemPrompt,
          claudeMaxTurns: 1,
          claudePermissionMode: "bypassPermissions" as const,
          claudeAllowedTools: [],
        }
      : {}),
    providerTimeoutMs: args.timeoutMs,
  };
}

function resolveWorkerExecutionModel(args: {
  profile: StaveAutoProfile;
  role: StaveWorkerRole;
  supervisorModel: string;
}): string {
  const model = resolveStaveWorkerModel({
    profile: args.profile,
    role: args.role,
  });
  if (args.profile.allowCrossProviderWorkers) {
    return model;
  }

  const workerProvider = resolveStaveProviderForModel({ model });
  const supervisorProvider = resolveStaveProviderForModel({ model: args.supervisorModel });
  return workerProvider === supervisorProvider ? model : args.supervisorModel;
}

export async function runOrchestrator(args: {
  userPrompt: string;
  profile: StaveAutoProfile;
  baseArgs: Pick<StreamTurnArgs, "cwd" | "taskId" | "workspaceId">;
  runtimeOptions?: ProviderRuntimeOptions;
  onEvent: (event: BridgeEvent) => void;
  runTurnBatch: (args: StreamTurnArgs) => Promise<BridgeEvent[]>;
}): Promise<void> {
  const supervisorModel = args.profile.supervisorModel;
  const supervisorProvider = resolveStaveProviderForModel({ model: supervisorModel });

  let decompositionEvents: BridgeEvent[];
  try {
    decompositionEvents = await args.runTurnBatch({
      providerId: supervisorProvider,
      prompt: buildSingleTurnPrompt({
        providerId: supervisorProvider,
        systemPrompt: buildSupervisorBreakdownPrompt({ profile: args.profile }),
        prompt: args.userPrompt,
      }),
      cwd: args.baseArgs.cwd,
      taskId: args.baseArgs.taskId,
      workspaceId: args.baseArgs.workspaceId,
      runtimeOptions: buildSingleTurnRuntimeOptions({
        providerId: supervisorProvider,
        model: supervisorModel,
        systemPrompt: buildSupervisorBreakdownPrompt({ profile: args.profile }),
        timeoutMs: 30_000,
      }),
    });
  } catch {
    args.onEvent({ type: "error", message: "Orchestrator: supervisor failed to produce a breakdown.", recoverable: true });
    args.onEvent({ type: "done" });
    return;
  }

  const subtasks = parseSubtaskSpec({
    raw: extractTextFromEvents(decompositionEvents),
    maxSubtasks: args.profile.maxSubtasks,
  });
  if (!subtasks) {
    args.onEvent({ type: "error", message: "Orchestrator: could not parse subtask breakdown.", recoverable: true });
    args.onEvent({ type: "done" });
    return;
  }

  args.onEvent({
    type: "stave:orchestration_processing",
    supervisorModel,
    subtasks: subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      model: resolveWorkerExecutionModel({
        profile: args.profile,
        role: subtask.role,
        supervisorModel,
      }),
      dependsOn: subtask.dependsOn,
    })),
  });

  const results = new Map<string, string>();
  const groups = topologicalGroups(subtasks);
  let subtaskCounter = 0;

  for (const group of groups) {
    for (let index = 0; index < group.length; index += args.profile.maxParallelSubtasks) {
      const batch = group.slice(index, index + args.profile.maxParallelSubtasks);
      await Promise.all(batch.map(async (subtask) => {
        subtaskCounter += 1;
        const workerModel = resolveWorkerExecutionModel({
          profile: args.profile,
          role: subtask.role,
          supervisorModel,
        });

        args.onEvent({
          type: "stave:subtask_started",
          subtaskId: subtask.id,
          index: subtaskCounter,
          total: subtasks.length,
          title: subtask.title,
          model: workerModel,
        });

        let resolvedPrompt = subtask.prompt;
        for (const [id, result] of results.entries()) {
          resolvedPrompt = resolvedPrompt.replaceAll(`{${id}}`, result);
        }

        const workerProvider = resolveStaveProviderForModel({ model: workerModel });
        let success = false;
        try {
          const subtaskEvents = await args.runTurnBatch({
            providerId: workerProvider,
            prompt: resolvedPrompt,
            cwd: args.baseArgs.cwd,
            taskId: args.baseArgs.taskId,
            workspaceId: args.baseArgs.workspaceId,
            runtimeOptions: {
              ...(args.runtimeOptions ?? {}),
              model: workerModel,
              ...(workerProvider === "claude-code"
                ? {
                    claudeMaxTurns: 5,
                    claudePermissionMode: args.runtimeOptions?.claudePermissionMode ?? "bypassPermissions",
                  }
                : {}),
              providerTimeoutMs: args.runtimeOptions?.providerTimeoutMs ?? 120_000,
            },
          });
          results.set(subtask.id, extractTextFromEvents(subtaskEvents));
          success = true;
        } catch {
          results.set(subtask.id, `(subtask ${subtask.id} failed)`);
        }

        args.onEvent({ type: "stave:subtask_done", subtaskId: subtask.id, success });
      }));
    }
  }

  args.onEvent({ type: "stave:synthesis_started" });

  const resultsContext = subtasks
    .map((subtask) => {
      const workerModel = resolveWorkerExecutionModel({
        profile: args.profile,
        role: subtask.role,
        supervisorModel,
      });
      return `## ${subtask.title} (${subtask.role} / ${workerModel})\n${results.get(subtask.id) ?? "(no output)"}`;
    })
    .join("\n\n");

  let synthesisEvents: BridgeEvent[];
  try {
    const synthesisPrompt = `Original request:\n${args.userPrompt}\n\n---\n\nWorker outputs:\n\n${resultsContext}`;
    synthesisEvents = await args.runTurnBatch({
      providerId: supervisorProvider,
      prompt: buildSingleTurnPrompt({
        providerId: supervisorProvider,
        systemPrompt: SUPERVISOR_SYNTHESIS_PROMPT,
        prompt: synthesisPrompt,
      }),
      cwd: args.baseArgs.cwd,
      taskId: args.baseArgs.taskId,
      workspaceId: args.baseArgs.workspaceId,
      runtimeOptions: buildSingleTurnRuntimeOptions({
        providerId: supervisorProvider,
        model: supervisorModel,
        systemPrompt: SUPERVISOR_SYNTHESIS_PROMPT,
        timeoutMs: 60_000,
      }),
    });
  } catch {
    args.onEvent({ type: "error", message: "Orchestrator: synthesis step failed.", recoverable: true });
    args.onEvent({ type: "done" });
    return;
  }

  for (const event of synthesisEvents) {
    if (event.type === "text" || event.type === "thinking") {
      args.onEvent(event);
    }
  }

  const doneEvent = synthesisEvents.find((event): event is Extract<BridgeEvent, { type: "done" }> => event.type === "done");
  args.onEvent({ type: "done", stop_reason: doneEvent?.stop_reason });
}
