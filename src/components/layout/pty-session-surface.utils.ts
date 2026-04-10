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
