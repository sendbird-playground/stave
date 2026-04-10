import { describe, expect, test } from "bun:test";
import {
  focusTerminalSurface,
  shouldCreatePtySession,
} from "../src/components/layout/pty-session-surface.utils";

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

describe("focusTerminalSurface", () => {
  test("prefers the terminal focus API when it is available", () => {
    let terminalFocusReceiver: unknown = null;
    let textareaFocused = false;
    const terminal = {
      focus(this: unknown) {
        terminalFocusReceiver = this;
      },
    };

    const didFocus = focusTerminalSurface({
      terminal,
      container: {
        querySelector: () => ({
          focus: () => {
            textareaFocused = true;
          },
        }),
      },
    });

    expect(didFocus).toBe(true);
    expect(terminalFocusReceiver).toBe(terminal);
    expect(textareaFocused).toBe(false);
  });

  test("falls back to the hidden textarea and then the container", () => {
    let textareaFocused = false;
    let containerFocused = false;

    const didFocusTextarea = focusTerminalSurface({
      container: {
        querySelector: () => ({
          focus: () => {
            textareaFocused = true;
          },
        }),
      },
    });
    const didFocusContainer = focusTerminalSurface({
      container: {
        querySelector: () => null,
        focus: () => {
          containerFocused = true;
        },
      },
    });

    expect(didFocusTextarea).toBe(true);
    expect(textareaFocused).toBe(true);
    expect(didFocusContainer).toBe(true);
    expect(containerFocused).toBe(true);
  });

  test("returns false when there is no focusable terminal target", () => {
    expect(focusTerminalSurface({ container: {} })).toBe(false);
  });
});
