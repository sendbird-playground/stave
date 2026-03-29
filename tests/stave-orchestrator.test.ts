import { describe, expect, test } from "bun:test";
import { runOrchestrator } from "../electron/providers/stave-orchestrator";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import { DEFAULT_STAVE_AUTO_PROFILE } from "../src/lib/providers/stave-auto-profile";

function customProfile(overrides: Partial<typeof DEFAULT_STAVE_AUTO_PROFILE> = {}) {
  return {
    ...DEFAULT_STAVE_AUTO_PROFILE,
    ...overrides,
  };
}

function textResponse(text: string): BridgeEvent[] {
  return [
    { type: "text", text },
    { type: "done" },
  ];
}

describe("runOrchestrator", () => {
  test("parses fenced supervisor output with wrapper text and role aliases", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Review the fix",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-1",
        workspaceId: "workspace-1",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(`Here's the breakdown:

\`\`\`json
[
  {"id":"st-1","title":"Review implementation","role":"review","prompt":"Inspect the current fix","dependsOn":[]}
]
\`\`\`

Use this plan.`);
          case 2:
            return textResponse("The implementation looks correct.");
          case 3:
            return textResponse("Final reviewed answer.");
          default:
            throw new Error(`Unexpected runTurnBatch call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("codex");
    expect(calls[1]?.prompt).toBe("Inspect the current fix");
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [{
        id: "st-1",
        title: "Review implementation",
        model: DEFAULT_STAVE_AUTO_PROFILE.verifyModel!,
        dependsOn: [],
      }],
    });
  });

  test("recovers bare JSON arrays even when the supervisor appends trailing text", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];

    await runOrchestrator({
      userPrompt: "Fix the orchestrator parser",
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-2",
        workspaceId: "workspace-2",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse(`[
  {"id":"st-1","title":"Implement parser fix","role":"implement","prompt":"Patch the parser","dependsOn":[]}
]

This keeps the response concise.`);
          case 2:
            return textResponse("Patched the parser.");
          case 3:
            return textResponse("Final implementation summary.");
          default:
            throw new Error(`Unexpected runTurnBatch call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("codex");
    expect(calls[1]?.prompt).toBe("Patch the parser");
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [{
        id: "st-1",
        title: "Implement parser fix",
        model: DEFAULT_STAVE_AUTO_PROFILE.implementModel,
        dependsOn: [],
      }],
    });
  });

  test("falls back to a single general subtask when no JSON array can be recovered", async () => {
    const calls: StreamTurnArgs[] = [];
    const emittedEvents: BridgeEvent[] = [];
    const userPrompt = "Handle this request directly";

    await runOrchestrator({
      userPrompt,
      profile: customProfile(),
      baseArgs: {
        cwd: "/tmp/workspace",
        taskId: "task-3",
        workspaceId: "workspace-3",
      },
      onEvent: (event) => {
        emittedEvents.push(event);
      },
      runTurnBatch: async (args) => {
        calls.push(args);
        switch (calls.length) {
          case 1:
            return textResponse("I can handle this directly without a structured breakdown.");
          case 2:
            return textResponse("Handled via fallback worker.");
          case 3:
            return textResponse("Final synthesized answer.");
          default:
            throw new Error(`Unexpected runTurnBatch call ${calls.length}`);
        }
      },
    });

    expect(calls[1]?.providerId).toBe("claude-code");
    expect(calls[1]?.prompt).toBe(userPrompt);
    expect(emittedEvents).toContainEqual({
      type: "stave:orchestration_processing",
      supervisorModel: DEFAULT_STAVE_AUTO_PROFILE.supervisorModel,
      subtasks: [{
        id: "st-fallback",
        title: "Process request",
        model: DEFAULT_STAVE_AUTO_PROFILE.generalModel,
        dependsOn: [],
      }],
    });
  });
});
