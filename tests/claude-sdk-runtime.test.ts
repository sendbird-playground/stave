import { describe, expect, test } from "bun:test";
import {
  buildClaudeApprovalPermissionResult,
  resolveClaudeAgentProgressSummaries,
  buildClaudeSystemPrompt,
  buildClaudeUserInputPermissionResult,
  mapClaudeMessageToEvents,
  resolveClaudeDisallowedTools,
  shouldAutoAllowClaudeTool,
  shouldDenyClaudeToolInPlanMode,
  SubagentProgressTracker,
} from "../electron/providers/claude-sdk-runtime";

const workspaceRoot = "/workspace/stave";

describe("mapClaudeMessageToEvents", () => {
  test("surfaces Claude init session ids as provider conversation metadata", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "init",
        session_id: "session-1",
        uuid: "msg-init-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "provider_session",
        providerId: "claude-code",
        nativeSessionId: "session-1",
      },
    ]);
  });

  test("surfaces Claude local command output as assistant text", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "local_command_output",
        content: "Current cost: $0.12",
        uuid: "msg-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "text", text: "Current cost: $0.12" },
    ]);
  });

  test("surfaces Claude task progress summaries as system events", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "task_progress",
        summary: "Analyzing authentication module",
        uuid: "msg-progress-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "system", content: "Subagent progress: Analyzing authentication module" },
    ]);
  });

  test("surfaces compact_boundary as a system event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "manual", pre_tokens: 50000 },
        uuid: "msg-compact-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "system",
        content: "Context compacted (manual).",
        compactBoundary: { trigger: "manual" },
      },
    ]);
  });

  test("surfaces compact_boundary with auto trigger", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 80000 },
        uuid: "msg-compact-2",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "system",
        content: "Context compacted (auto).",
        compactBoundary: { trigger: "auto" },
      },
    ]);
  });

  test("surfaces compacting status as a system event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "status",
        status: "compacting",
        uuid: "msg-status-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "system", content: "Compacting conversation context\u2026" },
    ]);
  });

  test("ignores null status messages", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "status",
        status: null,
        uuid: "msg-status-2",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([]);
  });

  test("surfaces tool_progress as a tool_progress event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "tool_progress",
        tool_use_id: "tool-abc",
        tool_name: "Bash",
        parent_tool_use_id: null,
        elapsed_time_seconds: 15,
        uuid: "msg-tp-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "tool_progress", toolUseId: "tool-abc", toolName: "Bash", elapsedSeconds: 15 },
    ]);
  });

  test("surfaces ExitPlanMode tool use as a plan_ready event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "assistant",
        message: {
          content: [{
            type: "tool_use",
            name: "ExitPlanMode",
            input: {
              plan: "1. Inspect the task\n2. Ship the patch",
            },
          }],
        },
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "plan_ready",
        planText: "1. Inspect the task\n2. Ship the patch",
      },
    ]);
  });
});

describe("buildClaudeApprovalPermissionResult", () => {
  test("returns an allow payload with updated input for approved tools", () => {
    expect(buildClaudeApprovalPermissionResult({
      approved: true,
      normalizedInput: { skill: "keybindings-help" },
      denialMessage: "denied",
    })).toEqual({
      behavior: "allow",
      updatedInput: { skill: "keybindings-help" },
    });
  });

  test("returns a deny payload with a message for rejected tools", () => {
    expect(buildClaudeApprovalPermissionResult({
      approved: false,
      normalizedInput: { file_path: "/tmp/demo" },
      denialMessage: "User denied permission for Read.",
    })).toEqual({
      behavior: "deny",
      message: "User denied permission for Read.",
    });
  });
});

describe("buildClaudeUserInputPermissionResult", () => {
  test("returns an allow payload with merged answers for approved question responses", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: {
        questions: [{ header: "Name", question: "Who?", options: [{ label: "A", description: "A" }] }],
      },
      answers: { name: "Asty" },
    })).toEqual({
      behavior: "allow",
      updatedInput: {
        questions: [{ header: "Name", question: "Who?", options: [{ label: "A", description: "A" }] }],
        answers: { name: "Asty" },
      },
    });
  });

  test("returns a deny payload when the user declines to answer", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: { questions: [] },
      denied: true,
    })).toEqual({
      behavior: "deny",
      message: "User declined to answer questions.",
    });
  });
});

describe("Claude internal tool auto-allow", () => {
  test("auto-allows ExitPlanMode without surfacing an approval wait", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "ExitPlanMode",
    })).toBe(true);
  });

  test("does not auto-allow ordinary tools", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "Bash",
    })).toBe(false);
  });
});

describe("buildClaudeSystemPrompt", () => {
  test("anchors relative paths to the active workspace root", () => {
    expect(buildClaudeSystemPrompt({
      cwd: workspaceRoot,
    })).toContain(`Current workspace root: ${workspaceRoot}`);
  });

  test("preserves any existing system prompt before appending workspace rules", () => {
    const systemPrompt = buildClaudeSystemPrompt({
      cwd: workspaceRoot,
      baseSystemPrompt: "Follow repository conventions.",
    });

    expect(systemPrompt.startsWith("Follow repository conventions.")).toBe(true);
    expect(systemPrompt).toContain("Resolve every relative filesystem path against the workspace root above.");
  });
});

describe("resolveClaudeAgentProgressSummaries", () => {
  test("preserves explicit false so the SDK can be forced off", () => {
    expect(resolveClaudeAgentProgressSummaries(false)).toBe(false);
  });

  test("returns undefined when no override is set", () => {
    expect(resolveClaudeAgentProgressSummaries(undefined)).toBeUndefined();
  });
});

describe("resolveClaudeDisallowedTools", () => {
  test("adds mutating file tools while Claude plan mode is enabled", () => {
    expect(resolveClaudeDisallowedTools({
      permissionMode: "plan",
      runtimeDisallowedTools: ["Read", "Edit"],
    })).toEqual([
      "Read",
      "Edit",
      "MultiEdit",
      "Write",
      "NotebookEdit",
      "TodoWrite",
    ]);
  });

  test("preserves runtime disallowed tools outside plan mode", () => {
    expect(resolveClaudeDisallowedTools({
      permissionMode: "default",
      runtimeDisallowedTools: ["Read"],
    })).toEqual(["Read"]);
  });
});

describe("shouldDenyClaudeToolInPlanMode", () => {
  test("denies mutating built-in tools", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Edit",
      input: { file_path: "/workspace/stave/src/app.ts" },
    })).toBe(true);
  });

  test("denies mutating Bash commands", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Bash",
      input: { command: "echo hi > notes.txt" },
    })).toBe(true);
  });

  test("allows read-only Bash commands", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Bash",
      input: { command: "ls -la src" },
    })).toBe(false);
  });

  test("allows non-mutating read tools", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Read",
      input: { file_path: "/workspace/stave/README.md" },
    })).toBe(false);
  });
});

describe("SubagentProgressTracker", () => {
  test("resolves toolUseId from tracked Agent tool events (positional fallback)", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    expect(tracker.resolveToolUseId({})).toBe("toolu_1");
  });

  test("returns the most recent active Agent when multiple are pending", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });
    expect(tracker.resolveToolUseId({})).toBe("toolu_2");
  });

  test("removes completed agents from tracking", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool_result", tool_use_id: "toolu_2", output: "done" });
    expect(tracker.resolveToolUseId({})).toBe("toolu_1");
  });

  test("ignores non-agent tool events", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "Bash", toolUseId: "toolu_bash", input: "ls", state: "input-streaming" });
    expect(tracker.resolveToolUseId({})).toBeUndefined();
  });

  test("correlates via agent_id from hook metadata", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });

    // Hook message maps agent_id "A" to toolu_1
    tracker.processRawMessage({
      type: "hook_started",
      input: { agent_id: "A", tool_use_id: "toolu_1" },
    });
    // Hook message maps agent_id "B" to toolu_2
    tracker.processRawMessage({
      type: "hook_started",
      input: { agent_id: "B", tool_use_id: "toolu_2" },
    });

    // Progress from agent A resolves to toolu_1
    expect(tracker.resolveToolUseId({ agent_id: "A" })).toBe("toolu_1");
    // Progress from agent B resolves to toolu_2
    expect(tracker.resolveToolUseId({ agent_id: "B" })).toBe("toolu_2");
  });

  test("uses direct tool_use_id on progress message when available", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });

    // Progress message carries its own tool_use_id
    expect(tracker.resolveToolUseId({ tool_use_id: "toolu_1" })).toBe("toolu_1");
  });

  test("returns undefined when no agents have been tracked", () => {
    const tracker = new SubagentProgressTracker();
    expect(tracker.resolveToolUseId({})).toBeUndefined();
  });
});
