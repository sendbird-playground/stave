import { describe, expect, test } from "bun:test";
import { mapCodexElicitationToUserInput } from "../electron/providers/codex-app-server-runtime";

describe("mapCodexElicitationToUserInput", () => {
  test("maps form-mode elicitation schema into shared user-input questions", () => {
    const mapped = mapCodexElicitationToUserInput({
      message: "Pick the current workspace and confirm write access.",
      requestedSchema: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            title: "Workspace",
            oneOf: [
              { const: "ws-1", title: "Main workspace" },
              { const: "ws-2", title: "Review workspace" },
            ],
            default: "ws-1",
          },
          confirm: {
            type: "boolean",
            description: "Allow the tool to continue",
            default: true,
          },
          retries: {
            type: "integer",
            description: "Retry count",
            default: 2,
          },
        },
        required: ["workspaceId", "confirm"],
      },
    });

    expect(mapped?.mode).toBe("form");
    expect(mapped?.questions).toEqual([
      {
        key: "workspaceId",
        header: "Pick the current workspace and confirm write access.",
        question: "Provide Workspace.",
        inputType: "text",
        options: [
          { label: "Main workspace", description: "Provide Workspace." },
          { label: "Review workspace", description: "Provide Workspace." },
        ],
        allowCustom: false,
        required: true,
        defaultValue: "Main workspace",
      },
      {
        key: "confirm",
        header: "Pick the current workspace and confirm write access.",
        question: "Allow the tool to continue",
        inputType: "boolean",
        options: [
          { label: "Yes", description: "true" },
          { label: "No", description: "false" },
        ],
        allowCustom: false,
        required: true,
        defaultValue: "Yes",
      },
      {
        key: "retries",
        header: "Pick the current workspace and confirm write access.",
        question: "Retry count",
        inputType: "integer",
        options: [],
        allowCustom: true,
        required: false,
        placeholder: "retries",
        defaultValue: "2",
      },
    ]);
  });

  test("maps url-mode elicitation into a notice card", () => {
    const mapped = mapCodexElicitationToUserInput({
      mode: "url",
      message: "Authorize the integration in your browser.",
      url: "https://example.com/connect",
      elicitationId: "elicitation-1",
    });

    expect(mapped).toEqual({
      mode: "url",
      questions: [{
        key: "__elicitation_url__",
        header: "MCP URL Elicitation",
        question: "Authorize the integration in your browser.",
        inputType: "url_notice",
        options: [],
        allowCustom: false,
        required: false,
        linkUrl: "https://example.com/connect",
      }],
      fields: [],
    });
  });
});
