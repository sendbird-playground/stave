import { describe, expect, test } from "bun:test";
import {
  buildClaudeApprovalPermissionResult,
  resolveClaudeAgentProgressSummaries,
  buildClaudeSystemPrompt,
  buildClaudeUserInputPermissionResult,
  mapClaudeMessageToEvents,
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
        type: "provider_conversation",
        providerId: "claude-code",
        nativeConversationId: "session-1",
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
      { type: "system", content: "Context compacted (manual)." },
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
      { type: "system", content: "Context compacted (auto)." },
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
