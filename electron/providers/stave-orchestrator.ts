/**
 * Stave Orchestrator
 *
 * Coordinates multi-model task execution when the Pre-processor determines
 * that a request benefits from specialised agents working in sequence.
 *
 * Flow:
 *   1. Call the Supervisor to decompose the user prompt into 2-4 subtasks (JSON plan).
 *   2. Execute subtasks respecting `dependsOn` order (topological sort → parallel groups).
 *   3. Inject prior results into subsequent prompts via {subtask-id} placeholders.
 *   4. Call the Supervisor again to synthesise all results into a coherent response.
 */

import type { BridgeEvent, StreamTurnArgs } from "./types";
import type { ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";

// ── Supervisor prompts ────────────────────────────────────────────────────────

const SUPERVISOR_BREAKDOWN_PROMPT = `You are an orchestration supervisor for Stave AI coding assistant.
Given a user request, decompose it into 2-4 subtasks for specialized agents.

Available agents and their strengths:
- "claude-haiku-4-5": Fast analysis, reading code, quick questions
- "claude-sonnet-4-6": General coding, writing code, balanced tasks
- "gpt-5.3-codex": Pure code generation, precise implementations
- "claude-opus-4-6": Deep reasoning, complex analysis, architecture
- "gpt-5.4": Complex tasks needing speed, OpenAI ecosystem

Return ONLY a JSON array (no markdown):
[
  {"id":"st-1","title":"Analyse existing code","model":"claude-haiku-4-5","prompt":"...","dependsOn":[]},
  {"id":"st-2","title":"Implement fix","model":"gpt-5.3-codex","prompt":"Based on analysis: {st-1}\\n\\n...","dependsOn":["st-1"]}
]

Keep subtasks focused. Use {id} placeholders to reference previous results.
If the task needs only 1 subtask, return a single-element array.
Maximum 4 subtasks.`;

const SUPERVISOR_SYNTHESIS_PROMPT = `You are an orchestration supervisor. Multiple specialized agents have completed their work.
Synthesize their outputs into a coherent, helpful final response for the user.
Be concise - avoid repeating what the agents already produced verbatim.`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubtaskSpec {
  id: string;
  title: string;
  model: string;
  prompt: string;
  dependsOn: string[];
}

// ── Provider inference ────────────────────────────────────────────────────────

const CODEX_MODEL_IDS = new Set(["gpt-5.4", "gpt-5.3-codex"]);

function resolveProviderForModel(model: string): "claude-code" | "codex" {
  return CODEX_MODEL_IDS.has(model) ? "codex" : "claude-code";
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

function parseSubtaskSpec(raw: string): SubtaskSpec[] | null {
  const cleaned = raw
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
        || typeof item.model !== "string"
        || typeof item.prompt !== "string"
      ) {
        return null;
      }
      const dependsOn = Array.isArray(item.dependsOn)
        ? (item.dependsOn as unknown[]).filter((d): d is string => typeof d === "string")
        : [];
      subtasks.push({
        id: item.id as string,
        title: item.title as string,
        model: item.model as string,
        prompt: item.prompt as string,
        dependsOn,
      });
    }

    return subtasks.length > 0 ? subtasks.slice(0, 4) : null;
  } catch {
    return null;
  }
}

// ── Topological sort ──────────────────────────────────────────────────────────

/**
 * Groups subtasks by level: level 0 has no dependencies, level 1 depends only
 * on level 0, etc.  Subtasks within the same level can run in parallel.
 */
function topologicalGroups(subtasks: SubtaskSpec[]): SubtaskSpec[][] {
  const idToLevel = new Map<string, number>();
  const allIds = new Set(subtasks.map((s) => s.id));

  function getLevel(id: string): number {
    if (idToLevel.has(id)) {
      return idToLevel.get(id)!;
    }
    const task = subtasks.find((s) => s.id === id);
    if (!task) {
      return 0;
    }
    const validDeps = task.dependsOn.filter((d) => allIds.has(d));
    if (validDeps.length === 0) {
      idToLevel.set(id, 0);
      return 0;
    }
    const level = Math.max(...validDeps.map(getLevel)) + 1;
    idToLevel.set(id, level);
    return level;
  }

  for (const st of subtasks) {
    getLevel(st.id);
  }

  const maxLevel = Math.max(0, ...Array.from(idToLevel.values()));
  const groups: SubtaskSpec[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const st of subtasks) {
    const level = idToLevel.get(st.id) ?? 0;
    groups[level]!.push(st);
  }

  return groups.filter((g) => g.length > 0);
}

// ── Text extraction ───────────────────────────────────────────────────────────

function extractTextFromEvents(events: BridgeEvent[]): string {
  return events
    .filter((e): e is Extract<BridgeEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.text)
    .join("");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runOrchestrator(args: {
  userPrompt: string;
  supervisorModel: string;
  baseArgs: Pick<StreamTurnArgs, "cwd" | "taskId" | "workspaceId">;
  runtimeOptions?: ProviderRuntimeOptions;
  onEvent: (event: BridgeEvent) => void;
  runTurnBatch: (args: StreamTurnArgs) => Promise<BridgeEvent[]>;
}): Promise<void> {
  const { userPrompt, supervisorModel, baseArgs, runtimeOptions, onEvent, runTurnBatch } = args;
  const supervisorProvider = resolveProviderForModel(supervisorModel);

  // ── Step 1: Ask supervisor to decompose the request ────────────────────────
  let decompositionEvents: BridgeEvent[];
  try {
    decompositionEvents = await runTurnBatch({
      providerId: supervisorProvider,
      prompt: userPrompt,
      cwd: baseArgs.cwd,
      taskId: baseArgs.taskId,
      workspaceId: baseArgs.workspaceId,
      runtimeOptions: {
        model: supervisorModel,
        claudeSystemPrompt: SUPERVISOR_BREAKDOWN_PROMPT,
        claudeMaxTurns: 1,
        claudePermissionMode: "bypassPermissions",
        claudeAllowedTools: [],
        providerTimeoutMs: 30_000,
      },
    });
  } catch {
    // Supervisor unreachable — emit a single done event so the turn ends cleanly.
    onEvent({ type: "error", message: "Orchestrator: supervisor failed to produce a breakdown.", recoverable: true });
    onEvent({ type: "done" });
    return;
  }

  const decompositionRaw = extractTextFromEvents(decompositionEvents);
  const subtasks = parseSubtaskSpec(decompositionRaw);

  if (!subtasks) {
    // Could not parse plan — fall back gracefully.
    onEvent({ type: "error", message: "Orchestrator: could not parse subtask breakdown.", recoverable: true });
    onEvent({ type: "done" });
    return;
  }

  // Emit the plan event so the UI can render the progress card.
  onEvent({
    type: "stave:orchestration_processing",
    supervisorModel,
    subtasks: subtasks.map((st) => ({
      id: st.id,
      title: st.title,
      model: st.model,
      dependsOn: st.dependsOn,
    })),
  });

  // ── Step 2: Execute subtasks in topological order ──────────────────────────
  const results = new Map<string, string>();
  const groups = topologicalGroups(subtasks);
  let subtaskIndex = 0;

  for (const group of groups) {
    await Promise.all(
      group.map(async (subtask) => {
        const index = subtaskIndex++;
        onEvent({
          type: "stave:subtask_started",
          subtaskId: subtask.id,
          index,
          total: subtasks.length,
          title: subtask.title,
          model: subtask.model,
        });

        // Inject prior results via {id} placeholders.
        let resolvedPrompt = subtask.prompt;
        for (const [id, result] of results.entries()) {
          resolvedPrompt = resolvedPrompt.replaceAll(`{${id}}`, result);
        }

        const provider = resolveProviderForModel(subtask.model);
        let success = false;
        try {
          const subtaskEvents = await runTurnBatch({
            providerId: provider,
            prompt: resolvedPrompt,
            cwd: baseArgs.cwd,
            taskId: baseArgs.taskId,
            workspaceId: baseArgs.workspaceId,
            runtimeOptions: {
              ...(runtimeOptions ?? {}),
              model: subtask.model,
              claudeMaxTurns: 5,
              claudePermissionMode: runtimeOptions?.claudePermissionMode ?? "bypassPermissions",
              providerTimeoutMs: runtimeOptions?.providerTimeoutMs ?? 120_000,
            },
          });
          const resultText = extractTextFromEvents(subtaskEvents);
          results.set(subtask.id, resultText);
          success = true;
        } catch {
          results.set(subtask.id, `(subtask ${subtask.id} failed)`);
        }

        onEvent({ type: "stave:subtask_done", subtaskId: subtask.id, success });
      }),
    );
  }

  // ── Step 3: Synthesise results ─────────────────────────────────────────────
  onEvent({ type: "stave:synthesis_started" });

  const resultsContext = subtasks
    .map((st) => `## ${st.title} (${st.model})\n${results.get(st.id) ?? "(no output)"}`)
    .join("\n\n");

  const synthesisPrompt = `Original request:\n${userPrompt}\n\n---\n\nAgent outputs:\n\n${resultsContext}`;

  let synthesisEvents: BridgeEvent[];
  try {
    synthesisEvents = await runTurnBatch({
      providerId: supervisorProvider,
      prompt: synthesisPrompt,
      cwd: baseArgs.cwd,
      taskId: baseArgs.taskId,
      workspaceId: baseArgs.workspaceId,
      runtimeOptions: {
        model: supervisorModel,
        claudeSystemPrompt: SUPERVISOR_SYNTHESIS_PROMPT,
        claudeMaxTurns: 1,
        claudePermissionMode: "bypassPermissions",
        claudeAllowedTools: [],
        providerTimeoutMs: 60_000,
      },
    });
  } catch {
    onEvent({ type: "error", message: "Orchestrator: synthesis step failed.", recoverable: true });
    onEvent({ type: "done" });
    return;
  }

  // Stream the synthesis output as normal text events.
  for (const event of synthesisEvents) {
    if (event.type === "text" || event.type === "thinking") {
      onEvent(event);
    }
  }

  // Emit final done with stop reason if available.
  const doneEvent = synthesisEvents.find((e): e is Extract<BridgeEvent, { type: "done" }> => e.type === "done");
  onEvent({ type: "done", stop_reason: doneEvent?.stop_reason });
}
