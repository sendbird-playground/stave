import { describe, expect, test } from "bun:test";
import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  buildNotificationDetail,
  formatApprovalNotificationDetail,
  formatNotificationStopReason,
} from "@/lib/notifications/notification.utils";

describe("notification formatting utils", () => {
  test("maps known stop reasons to readable labels", () => {
    expect(formatNotificationStopReason("end_turn")).toBe("Completed normally");
    expect(formatNotificationStopReason("max_tokens")).toBe("Token limit reached");
  });

  test("returns null for empty stop reasons and preserves unknown values", () => {
    expect(formatNotificationStopReason("  ")).toBeNull();
    expect(formatNotificationStopReason("custom_stop")).toBe("custom_stop");
  });

  test("builds approval detail from tool name and description", () => {
    expect(formatApprovalNotificationDetail({
      toolName: "Bash",
      description: "Run tests before continuing",
    })).toBe("Bash: Run tests before continuing");
  });

  test("falls back to the available approval field", () => {
    expect(formatApprovalNotificationDetail({
      toolName: "Bash",
      description: "   ",
    })).toBe("Bash");

    expect(formatApprovalNotificationDetail({
      description: "Run tests before continuing",
    })).toBe("Run tests before continuing");
  });

  test("returns null for completed notifications without a stop reason", () => {
    const notification = {
      kind: "task.turn_completed",
      payload: {
        stopReason: null,
      },
    } satisfies Pick<AppNotification, "kind" | "payload">;

    expect(buildNotificationDetail(notification)).toBeNull();
  });

  test("uses the same detail formatting for approval notifications", () => {
    const notification = {
      kind: "task.approval_requested",
      payload: {
        toolName: "Bash",
        description: "Run tests before continuing",
      },
    } satisfies Pick<AppNotification, "kind" | "payload">;

    expect(buildNotificationDetail(notification)).toBe("Bash: Run tests before continuing");
  });
});
