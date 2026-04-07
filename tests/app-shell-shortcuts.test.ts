import { describe, expect, test } from "bun:test";
import {
  EDITABLE_SHORTCUT_SELECTOR,
  PROMPT_INPUT_ROOT_SELECTOR,
  TASK_ABORT_SHORTCUT_SCOPE_SELECTOR,
  isEditableShortcutTarget,
  resolveShortcutChord,
  shouldAbortTaskOnEscape,
  ZEN_MODE_SHORTCUT_CHORD_TIMEOUT_MS,
} from "../src/components/layout/app-shell.shortcuts";

type FakeTarget = EventTarget & {
  closest: (selector: string) => Element | null;
  isContentEditable?: boolean;
};

function createTarget(args: {
  matches?: string[];
  isContentEditable?: boolean;
} = {}): FakeTarget {
  const matches = new Set(args.matches ?? []);
  return {
    isContentEditable: args.isContentEditable,
    closest: (selector: string) => (matches.has(selector) ? {} as Element : null),
  } as FakeTarget;
}

describe("app shell shortcut gating", () => {
  test("treats generic inputs as editable shortcut targets", () => {
    const target = createTarget({ matches: [EDITABLE_SHORTCUT_SELECTOR] });

    expect(isEditableShortcutTarget(target)).toBe(true);
  });

  test("keeps the prompt input eligible for shell shortcuts", () => {
    const target = createTarget({ matches: [EDITABLE_SHORTCUT_SELECTOR, PROMPT_INPUT_ROOT_SELECTOR] });

    expect(isEditableShortcutTarget(target)).toBe(false);
  });

  test("allows Escape abort when focus stays inside the task pane", () => {
    const taskPane = createTarget({ matches: [TASK_ABORT_SHORTCUT_SCOPE_SELECTOR] });

    expect(shouldAbortTaskOnEscape({
      key: "Escape",
      target: taskPane,
      activeElement: taskPane,
    })).toBe(true);
  });

  test("allows Escape abort for window-level events when the active element is in the task pane", () => {
    const taskPane = createTarget({ matches: [TASK_ABORT_SHORTCUT_SCOPE_SELECTOR] });

    expect(shouldAbortTaskOnEscape({
      key: "Escape",
      target: null,
      activeElement: taskPane,
    })).toBe(true);
  });

  test("blocks Escape abort when focus is outside the task pane", () => {
    const dialogButton = createTarget();

    expect(shouldAbortTaskOnEscape({
      key: "Escape",
      target: dialogButton,
      activeElement: dialogButton,
    })).toBe(false);
  });

  test("starts the zen-mode chord on Cmd/Ctrl+K", () => {
    expect(resolveShortcutChord({
      key: "k",
      metaKey: true,
      now: 100,
    })).toEqual({
      action: null,
      nextPendingChord: {
        type: "zen-mode",
        startedAt: 100,
      },
      preventDefault: true,
    });
  });

  test("toggles zen mode when Z follows the chord before timeout", () => {
    expect(resolveShortcutChord({
      key: "z",
      pendingChord: {
        type: "zen-mode",
        startedAt: 100,
      },
      now: 100 + ZEN_MODE_SHORTCUT_CHORD_TIMEOUT_MS - 1,
    })).toEqual({
      action: "toggle-zen-mode",
      nextPendingChord: null,
      preventDefault: true,
    });
  });

  test("keeps the chord valid when Cmd/Ctrl stays held for the second Z key", () => {
    expect(resolveShortcutChord({
      key: "z",
      metaKey: true,
      pendingChord: {
        type: "zen-mode",
        startedAt: 100,
      },
      now: 150,
    })).toEqual({
      action: "toggle-zen-mode",
      nextPendingChord: null,
      preventDefault: true,
    });
  });

  test("cancels expired zen-mode chords", () => {
    expect(resolveShortcutChord({
      key: "z",
      pendingChord: {
        type: "zen-mode",
        startedAt: 100,
      },
      now: 100 + ZEN_MODE_SHORTCUT_CHORD_TIMEOUT_MS + 1,
    })).toEqual({
      action: null,
      nextPendingChord: null,
      preventDefault: false,
    });
  });
});
