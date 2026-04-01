export const EDITABLE_SHORTCUT_SELECTOR = "input, textarea, select, [role='textbox'], [contenteditable='true']";
export const PROMPT_INPUT_ROOT_SELECTOR = "[data-prompt-input-root]";
export const TASK_ABORT_SHORTCUT_SCOPE_SELECTOR = "[data-task-abort-scope]";

type ClosestCapableTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
};

function matchesClosest(target: EventTarget | null | undefined, selector: string) {
  const candidate = target as ClosestCapableTarget | null | undefined;
  return typeof candidate?.closest === "function" && Boolean(candidate.closest(selector));
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  const candidate = target as ClosestCapableTarget | null;
  if (!candidate) {
    return false;
  }

  return Boolean(
    candidate.isContentEditable
    || (
      matchesClosest(target, EDITABLE_SHORTCUT_SELECTOR)
      && !matchesClosest(target, PROMPT_INPUT_ROOT_SELECTOR)
    ),
  );
}

export function shouldAbortTaskOnEscape(args: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
  activeElement: EventTarget | null;
}) {
  if (args.key !== "Escape" || args.ctrlKey || args.metaKey || args.shiftKey) {
    return false;
  }

  if (isEditableShortcutTarget(args.target)) {
    return false;
  }

  return (
    matchesClosest(args.target, TASK_ABORT_SHORTCUT_SCOPE_SELECTOR)
    || matchesClosest(args.activeElement, TASK_ABORT_SHORTCUT_SCOPE_SELECTOR)
  );
}
