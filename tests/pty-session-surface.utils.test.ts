import { describe, expect, test } from "bun:test";
import { shouldCreatePtySession } from "../src/components/layout/pty-session-surface.utils";

describe("shouldCreatePtySession", () => {
  test("does not create a session while the surface is hidden", () => {
    expect(shouldCreatePtySession({
      isVisible: false,
      workspaceId: "ws-main",
      hasActiveTab: true,
    })).toBe(false);
  });

  test("does not create a session without a workspace id or active tab", () => {
    expect(shouldCreatePtySession({
      isVisible: true,
      workspaceId: "",
      hasActiveTab: true,
    })).toBe(false);
    expect(shouldCreatePtySession({
      isVisible: true,
      workspaceId: "ws-main",
      hasActiveTab: false,
    })).toBe(false);
  });

  test("creates a session only when the visible surface has an active tab", () => {
    expect(shouldCreatePtySession({
      isVisible: true,
      workspaceId: "ws-main",
      hasActiveTab: true,
    })).toBe(true);
  });
});
