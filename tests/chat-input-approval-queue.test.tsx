import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatInputApprovalQueue } from "@/components/session/chat-input-approval-queue";

describe("ChatInputApprovalQueue", () => {
  test("renders a visible approval queue with newest-first items", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [
        {
          messageId: "message-2",
          part: {
            type: "approval",
            toolName: "Bash",
            description: "Run npm test",
            requestId: "req-2",
            state: "approval-requested" as const,
          },
        },
        {
          messageId: "message-1",
          part: {
            type: "approval",
            toolName: "Read",
            description: "Open .env",
            requestId: "req-1",
            state: "approval-requested" as const,
          },
        },
      ],
      onResolveApproval: () => {},
    }));

    expect(html).toContain("Approval Queue");
    expect(html).toContain("2 requests waiting");
    expect(html).toContain("Press");
    expect(html).toContain("Bash");
    expect(html).toContain("Read");
    expect(html.indexOf("Run npm test")).toBeLessThan(html.indexOf("Open .env"));
  });

  test("omits the keyboard hint when queue actions are disabled", () => {
    const html = renderToStaticMarkup(createElement(ChatInputApprovalQueue, {
      approvals: [
        {
          messageId: "message-1",
          part: {
            type: "approval",
            toolName: "Write",
            description: "Edit src/App.tsx",
            requestId: "req-1",
            state: "approval-requested" as const,
          },
        },
      ],
      disabled: true,
      disabledReason: "Managed elsewhere.",
      onResolveApproval: () => {},
    }));

    expect(html).toContain("1 request waiting");
    expect(html).toContain("Managed elsewhere.");
    expect(html).not.toContain("approve the latest request");
  });
});
