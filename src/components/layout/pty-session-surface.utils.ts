export function shouldCreatePtySession(args: {
  isVisible: boolean;
  workspaceId: string;
  hasActiveTab: boolean;
}) {
  return args.isVisible && args.hasActiveTab && Boolean(args.workspaceId);
}

export function createLatestAsyncDispatcher<T>(args: {
  run: (value: T) => Promise<void>;
  onError?: (error: unknown, value: T) => void;
}) {
  let inFlight = false;
  let pending: T | null = null;

  const flush = () => {
    if (inFlight || pending === null) {
      return;
    }

    const next = pending;
    pending = null;
    inFlight = true;

    void args.run(next)
      .catch((error) => {
        args.onError?.(error, next);
      })
      .finally(() => {
        inFlight = false;
        flush();
      });
  };

  return {
    schedule(value: T) {
      pending = value;
      flush();
    },
    clear() {
      pending = null;
    },
  };
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
