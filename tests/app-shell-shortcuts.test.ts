import { describe, expect, test } from "bun:test";
import {
  EDITABLE_SHORTCUT_SELECTOR,
  PROMPT_INPUT_ROOT_SELECTOR,
  TASK_ABORT_SHORTCUT_SCOPE_SELECTOR,
  isEditableShortcutTarget,
  shouldAbortTaskOnEscape,
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
});
