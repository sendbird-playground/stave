import { describe, expect, test } from "bun:test";
import {
  findLatestPendingApprovalPart,
  findPendingApprovalMessageByRequestId,
  findLatestPendingUserInputPart,
  hasRenderableAssistantContent,
  mergePromptSuggestions,
  mergeToolResultIntoPart,
  updateApprovalPartsByRequestId,
  updateUserInputPartsByRequestId,
} from "@/store/provider-message.utils";

describe("hasRenderableAssistantContent", () => {
  test("treats tool-only messages as renderable", () => {
    expect(hasRenderableAssistantContent({
      message: {
        content: "",
        isPlanResponse: false,
        parts: [{
          type: "tool_use",
          toolUseId: "tool-1",
          toolName: "bash",
          input: "ls",
          output: "file.txt",
          state: "output-available",
        }],
      },
    })).toBe(true);
  });

  test("returns false for genuinely empty assistant messages", () => {
    expect(hasRenderableAssistantContent({
      message: {
        content: "",
        isPlanResponse: false,
        parts: [],
      },
    })).toBe(false);
  });
});

describe("mergePromptSuggestions", () => {
  test("appends new suggestions without losing earlier values", () => {
    expect(mergePromptSuggestions({
      existing: ["Open a PR"],
      incoming: ["Refactor next", "Open a PR"],
    })).toEqual([
      "Open a PR",
      "Refactor next",
    ]);
  });
});

describe("mergeToolResultIntoPart", () => {
  test("keeps partial tool updates in an active state", () => {
    expect(mergeToolResultIntoPart({
      part: {
        type: "tool_use",
        toolUseId: "tool-1",
        toolName: "bash",
        input: "npm test",
        state: "input-available",
      },
      event: {
        tool_use_id: "tool-1",
        output: "running",
        isPartial: true,
      },
    })).toMatchObject({
      type: "tool_use",
      output: "running",
      state: "input-streaming",
    });
  });

  test("marks final tool results as completed", () => {
    expect(mergeToolResultIntoPart({
      part: {
        type: "tool_use",
        toolUseId: "tool-1",
        toolName: "bash",
        input: "npm test",
        state: "input-streaming",
      },
      event: {
        tool_use_id: "tool-1",
        output: "done",
      },
    })).toMatchObject({
      type: "tool_use",
      output: "done",
      state: "output-available",
    });
  });
});

describe("findLatestPendingApprovalPart", () => {
  test("prefers the latest still-pending approval in a message", () => {
    expect(findLatestPendingApprovalPart({
      message: {
        parts: [
          {
            type: "approval",
            toolName: "Skill",
            description: "old",
            requestId: "req-old",
            state: "approval-responded",
          },
          {
            type: "approval",
            toolName: "Read",
            description: "new",
            requestId: "req-new",
            state: "approval-requested",
          },
        ],
      },
    })).toMatchObject({
      requestId: "req-new",
      state: "approval-requested",
    });
  });
});

describe("findPendingApprovalMessageByRequestId", () => {
  test("finds the pending approval and its parent message id", () => {
    expect(findPendingApprovalMessageByRequestId({
      requestId: "req-target",
      messages: [
        {
          id: "message-1",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [{
            type: "approval",
            toolName: "Skill",
            description: "old",
            requestId: "req-old",
            state: "approval-requested",
          }],
        },
        {
          id: "message-2",
          role: "assistant",
          model: "codex",
          providerId: "codex",
          content: "",
          parts: [{
            type: "approval",
            toolName: "Bash",
            description: "current",
            requestId: "req-target",
            state: "approval-requested",
          }],
        },
      ],
    })).toMatchObject({
      messageId: "message-2",
      part: {
        requestId: "req-target",
        state: "approval-requested",
      },
    });
  });
});

describe("findLatestPendingUserInputPart", () => {
  test("prefers the latest still-pending user input request in a message", () => {
    expect(findLatestPendingUserInputPart({
      message: {
        parts: [
          {
            type: "user_input",
            toolName: "AskUserQuestion",
            requestId: "req-old",
            questions: [{
              question: "Old?",
              header: "Old",
              options: [{ label: "A", description: "a" }],
            }],
            answers: { old: "A" },
            state: "input-responded",
          },
          {
            type: "user_input",
            toolName: "AskUserQuestion",
            requestId: "req-new",
            questions: [{
              question: "New?",
              header: "New",
              options: [{ label: "B", description: "b" }],
            }],
            state: "input-requested",
          },
        ],
      },
    })).toMatchObject({
      requestId: "req-new",
      state: "input-requested",
    });
  });
});

describe("updateApprovalPartsByRequestId", () => {
  test("updates only the matching approval part", () => {
    expect(updateApprovalPartsByRequestId({
      requestId: "req-new",
      approved: true,
      parts: [
        {
          type: "approval",
          toolName: "Skill",
          description: "old",
          requestId: "req-old",
          state: "approval-requested",
        },
        {
          type: "approval",
          toolName: "Read",
          description: "new",
          requestId: "req-new",
          state: "approval-requested",
        },
      ],
    })).toEqual([
      {
        type: "approval",
        toolName: "Skill",
        description: "old",
        requestId: "req-old",
        state: "approval-requested",
      },
      {
        type: "approval",
        toolName: "Read",
        description: "new",
        requestId: "req-new",
        state: "approval-responded",
      },
    ]);
  });
});

describe("updateUserInputPartsByRequestId", () => {
  test("updates only the matching user input part", () => {
    expect(updateUserInputPartsByRequestId({
      requestId: "req-new",
      answers: { answer: "B" },
      parts: [
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "req-old",
          questions: [{
            question: "Old?",
            header: "Old",
            options: [{ label: "A", description: "a" }],
          }],
          state: "input-requested",
        },
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "req-new",
          questions: [{
            question: "New?",
            header: "New",
            options: [{ label: "B", description: "b" }],
          }],
          state: "input-requested",
        },
      ],
    })).toEqual([
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "req-old",
        questions: [{
          question: "Old?",
          header: "Old",
          options: [{ label: "A", description: "a" }],
        }],
        state: "input-requested",
      },
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "req-new",
        questions: [{
          question: "New?",
          header: "New",
          options: [{ label: "B", description: "b" }],
        }],
        answers: { answer: "B" },
        state: "input-responded",
      },
    ]);
  });
});
