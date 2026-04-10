export function shouldCreatePtySession(args: {
  isVisible: boolean;
  workspaceId: string;
  hasActiveTab: boolean;
}) {
  return args.isVisible && args.hasActiveTab && Boolean(args.workspaceId);
}

type FocusableTarget = {
  focus?: (this: unknown, options?: { preventScroll?: boolean }) => void;
};

type QueryableContainer = FocusableTarget & {
  querySelector?: (selector: string) => unknown;
};

export function focusTerminalSurface(args: {
  terminal?: FocusableTarget | null;
  container?: QueryableContainer | null;
}) {
  if (
    args.terminal
    && typeof args.terminal.focus === "function"
  ) {
    args.terminal.focus();
    return true;
  }

  const textarea = args.container?.querySelector?.("textarea");
  if (
    textarea
    && typeof (textarea as FocusableTarget | null | undefined)?.focus === "function"
  ) {
    (textarea as FocusableTarget).focus?.call(textarea, { preventScroll: true });
    return true;
  }

  if (
    args.container
    && typeof args.container.focus === "function"
  ) {
    args.container.focus({ preventScroll: true });
    return true;
  }

  return false;
}
