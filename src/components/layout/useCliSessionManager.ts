import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createLatestAsyncDispatcher } from "@/components/layout/pty-session-surface.utils";
import type { CliTerminalInstanceController } from "@/components/layout/useCliTerminalInstance";

const TERMINAL_POLL_INTERVAL_MS = 120;
const TERMINAL_INPUT_BUFFER_CHAR_LIMIT = 200_000;

type CreateSessionResult = {
  ok: boolean;
  sessionId?: string;
  stderr?: string;
};

type TerminalResizeRequest = {
  sessionId: string;
  cols: number;
  rows: number;
};

type SessionExitInfo = {
  exitCode: number;
  signal?: number;
};

type SetBridgeError = Dispatch<SetStateAction<Record<string, string>>>;

function appendTerminalInput(existing: string, nextChunk: string, limit: number) {
  if (!nextChunk) {
    return existing;
  }
  const combined = `${existing}${nextChunk}`;
  return combined.length <= limit ? combined : combined.slice(-limit);
}

function setBridgeErrorForTabKey(
  update: SetBridgeError,
  tabKey: string,
  message: string,
) {
  update((previous) => {
    if (!message) {
      if (!(tabKey in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[tabKey];
      return next;
    }

    if (previous[tabKey] === message) {
      return previous;
    }

    return {
      ...previous,
      [tabKey]: message,
    };
  });
}

export interface UseCliSessionManagerArgs<TTab extends { id: string }> {
  activeTab: TTab | null;
  activeTabId: string | null;
  tabs: readonly TTab[];
  workspaceId: string;
  isVisible: boolean;
  getTabKey: (tab: TTab) => string;
  createSession: (args: {
    tab: TTab;
    cols: number;
    rows: number;
    deliveryMode: "poll" | "push";
  }) => Promise<CreateSessionResult>;
  slotKeyForTab?: (tab: TTab) => string | null;
  terminalController: CliTerminalInstanceController;
  terminalReady: boolean;
}

export interface UseCliSessionManagerReturn {
  activeSessionId: string | null;
  bridgeError: string;
  handleTerminalInput: (input: string) => void;
  handleTerminalResize: (cols: number, rows: number) => Promise<void>;
  restartActiveSession: () => void;
  sessionExited: SessionExitInfo | null;
  writeToActiveSession: (input: string) => boolean;
}

export function useCliSessionManager<TTab extends { id: string }>(
  args: UseCliSessionManagerArgs<TTab>,
): UseCliSessionManagerReturn {
  const tabsRef = useRef(args.tabs);
  const createSessionRef = useRef(args.createSession);
  const slotKeyForTabRef = useRef(args.slotKeyForTab);
  const terminalControllerRef = useRef(args.terminalController);
  const activeTabRef = useRef(args.activeTab);

  useEffect(() => {
    tabsRef.current = args.tabs;
    createSessionRef.current = args.createSession;
    slotKeyForTabRef.current = args.slotKeyForTab;
    terminalControllerRef.current = args.terminalController;
    activeTabRef.current = args.activeTab;
  }, [args.createSession, args.slotKeyForTab, args.tabs, args.terminalController]);

  const sessionIdByTabKeyRef = useRef<Record<string, string>>({});
  const tabKeyBySessionIdRef = useRef<Record<string, string>>({});
  const pendingInputBySessionRef = useRef<Record<string, string>>({});
  const writeInFlightBySessionRef = useRef<Record<string, boolean>>({});
  const flushScheduledBySessionRef = useRef<Record<string, boolean>>({});
  const exitedByTabKeyRef = useRef<Record<string, SessionExitInfo>>({});
  const lastResizeBySessionRef = useRef<Record<string, { cols: number; rows: number }>>({});
  const activeTabKeyRef = useRef<string | null>(null);
  const attachedSessionIdRef = useRef<string | null>(null);

  const [bridgeErrorByTabKey, setBridgeErrorByTabKey] = useState<Record<string, string>>({});
  const [sessionVersion, setSessionVersion] = useState(0);
  const [sessionExited, setSessionExited] = useState<SessionExitInfo | null>(null);
  const [restartVersion, setRestartVersion] = useState(0);

  const supportsPushTerminalOutput =
    typeof window !== "undefined" &&
    Boolean(window.api?.terminal?.subscribeSessionOutput);

  const activeTabKey = args.activeTab ? args.getTabKey(args.activeTab) : null;
  const activeSessionId = activeTabKey
    ? (sessionIdByTabKeyRef.current[activeTabKey] ?? null)
    : null;
  const bridgeError = activeTabKey
    ? (bridgeErrorByTabKey[activeTabKey] ?? "")
    : "";

  useEffect(() => {
    activeTabKeyRef.current = activeTabKey;
  }, [activeTabKey]);

  const resizeSessionDispatcherRef = useRef(
    createLatestAsyncDispatcher<TerminalResizeRequest>({
      run: async ({ sessionId, cols, rows }) => {
        const resizeSession = window.api?.terminal?.resizeSession;
        if (!resizeSession) {
          return;
        }
        const result = await resizeSession({ sessionId, cols, rows });
        if (!result?.ok) {
          throw new Error(result?.stderr || "Failed to resize backend session.");
        }
      },
      onError: (error, request) => {
        const lastResize = lastResizeBySessionRef.current[request.sessionId];
        if (
          lastResize &&
          lastResize.cols === request.cols &&
          lastResize.rows === request.rows
        ) {
          delete lastResizeBySessionRef.current[request.sessionId];
        }
        console.warn("[cli-session] failed to resize backend session", error);
      },
    }),
  );

  const notifySessionChange = useCallback(() => {
    setSessionVersion((value) => value + 1);
  }, []);

  const registerSession = useCallback((tabKey: string, sessionId: string) => {
    sessionIdByTabKeyRef.current[tabKey] = sessionId;
    tabKeyBySessionIdRef.current[sessionId] = tabKey;
    pendingInputBySessionRef.current[sessionId] = "";
    writeInFlightBySessionRef.current[sessionId] = false;
    delete exitedByTabKeyRef.current[tabKey];
    delete lastResizeBySessionRef.current[sessionId];
    notifySessionChange();
  }, [notifySessionChange]);

  const clearSessionRegistration = useCallback((tabKey: string, sessionId: string) => {
    if (sessionIdByTabKeyRef.current[tabKey] === sessionId) {
      delete sessionIdByTabKeyRef.current[tabKey];
    }
    if (tabKeyBySessionIdRef.current[sessionId] === tabKey) {
      delete tabKeyBySessionIdRef.current[sessionId];
    }
    delete pendingInputBySessionRef.current[sessionId];
    delete writeInFlightBySessionRef.current[sessionId];
    delete flushScheduledBySessionRef.current[sessionId];
    delete lastResizeBySessionRef.current[sessionId];
    notifySessionChange();
  }, [notifySessionChange]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    const sessionId = attachedSessionIdRef.current;
    if (!sessionId || cols < 1 || rows < 1) {
      return Promise.resolve();
    }

    const lastResize = lastResizeBySessionRef.current[sessionId];
    if (lastResize && lastResize.cols === cols && lastResize.rows === rows) {
      return Promise.resolve();
    }

    lastResizeBySessionRef.current[sessionId] = { cols, rows };
    return resizeSessionDispatcherRef.current.schedule({ sessionId, cols, rows });
  }, []);

  const enqueueTerminalInput = useCallback((sessionId: string, input: string) => {
    pendingInputBySessionRef.current[sessionId] = appendTerminalInput(
      pendingInputBySessionRef.current[sessionId] ?? "",
      input,
      TERMINAL_INPUT_BUFFER_CHAR_LIMIT,
    );

    if (flushScheduledBySessionRef.current[sessionId]) {
      return;
    }

    flushScheduledBySessionRef.current[sessionId] = true;
    queueMicrotask(() => {
      flushScheduledBySessionRef.current[sessionId] = false;
      flushTerminalInput(sessionId);
    });
  }, []);

  const flushTerminalInput = useCallback((sessionId: string) => {
    if (writeInFlightBySessionRef.current[sessionId]) {
      return;
    }

    const input = pendingInputBySessionRef.current[sessionId];
    if (!input) {
      return;
    }

    const writeSession = window.api?.terminal?.writeSession;
    const tabKey = tabKeyBySessionIdRef.current[sessionId];
    if (!writeSession) {
      if (tabKey) {
        terminalControllerRef.current.writeln(
          "\r\n[error] CLI session bridge unavailable.",
        );
        setBridgeErrorForTabKey(
          setBridgeErrorByTabKey,
          tabKey,
          "CLI session bridge unavailable. Use bun run dev:desktop.",
        );
      }
      delete pendingInputBySessionRef.current[sessionId];
      return;
    }

    pendingInputBySessionRef.current[sessionId] = "";
    writeInFlightBySessionRef.current[sessionId] = true;

    void writeSession({ sessionId, input })
      .catch(() => {
        pendingInputBySessionRef.current[sessionId] = appendTerminalInput(
          input,
          pendingInputBySessionRef.current[sessionId] ?? "",
          TERMINAL_INPUT_BUFFER_CHAR_LIMIT,
        );
        if (tabKey) {
          terminalControllerRef.current.writeln(
            "\r\n[error] failed to write CLI session input.",
          );
        }
      })
      .finally(() => {
        writeInFlightBySessionRef.current[sessionId] = false;
        if (pendingInputBySessionRef.current[sessionId]) {
          flushTerminalInput(sessionId);
        }
      });
  }, []);

  const handleTerminalInput = useCallback((input: string) => {
    const sessionId = attachedSessionIdRef.current;
    if (!sessionId || !input) {
      return;
    }
    enqueueTerminalInput(sessionId, input);
  }, [enqueueTerminalInput]);

  const writeToActiveSession = useCallback((input: string) => {
    const sessionId = attachedSessionIdRef.current;
    if (!sessionId || !input) {
      return false;
    }
    enqueueTerminalInput(sessionId, input);
    return true;
  }, [enqueueTerminalInput]);

  useEffect(() => {
    const subscribeSessionExit = window.api?.terminal?.subscribeSessionExit;
    if (!subscribeSessionExit) {
      return;
    }

    return subscribeSessionExit(({ sessionId, exitCode, signal }) => {
      const tabKey = tabKeyBySessionIdRef.current[sessionId];
      if (!tabKey) {
        return;
      }

      exitedByTabKeyRef.current[tabKey] = { exitCode, signal };
      clearSessionRegistration(tabKey, sessionId);

      const signalHint = signal ? ` (signal ${signal})` : "";
      const exitMessage =
        exitCode === 0
          ? `\r\n\x1b[2m[process exited with code 0${signalHint}]\x1b[0m\r\n`
          : `\r\n\x1b[33m[process exited with code ${exitCode}${signalHint}]\x1b[0m\r\n`;

      if (activeTabKeyRef.current === tabKey) {
        terminalControllerRef.current.write(exitMessage);
        setSessionExited({ exitCode, signal });
      }
    });
  }, [clearSessionRegistration]);

  useEffect(() => {
    if (!supportsPushTerminalOutput) {
      return;
    }

    const subscribeSessionOutput = window.api?.terminal?.subscribeSessionOutput;
    if (!subscribeSessionOutput) {
      return;
    }

    return subscribeSessionOutput(({ sessionId, output }) => {
      if (!output || sessionId !== attachedSessionIdRef.current) {
        return;
      }
      terminalControllerRef.current.write(output);
    });
  }, [supportsPushTerminalOutput]);

  useEffect(() => {
    if (supportsPushTerminalOutput) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      const sessionId = attachedSessionIdRef.current;
      const readSession = window.api?.terminal?.readSession;
      if (sessionId && readSession) {
        const result = await readSession({ sessionId });
        if (!cancelled && result.ok && result.output) {
          terminalControllerRef.current.write(result.output);
        }
      }

      if (!cancelled) {
        window.setTimeout(() => {
          void poll();
        }, TERMINAL_POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [supportsPushTerminalOutput]);

  const previousWorkspaceIdRef = useRef(args.workspaceId);
  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = args.workspaceId;
    if (previousWorkspaceId === args.workspaceId) {
      return;
    }

    const detachSession = window.api?.terminal?.detachSession;
    if (!detachSession) {
      return;
    }

    const previousPrefix = `${previousWorkspaceId}:`;
    for (const [tabKey, sessionId] of Object.entries(sessionIdByTabKeyRef.current)) {
      if (!tabKey.startsWith(previousPrefix)) {
        continue;
      }
      void detachSession({ sessionId }).catch(() => {
        // Best-effort detach while preserving the session mapping.
      });
    }
  }, [args.workspaceId]);

  useEffect(() => {
    const closeSession = window.api?.terminal?.closeSession;
    if (!closeSession) {
      return;
    }

    const liveTabKeys = new Set(args.tabs.map((tab) => args.getTabKey(tab)));
    const currentPrefix = `${args.workspaceId}:`;
    const removedEntries = Object.entries(sessionIdByTabKeyRef.current).filter(
      ([tabKey]) => tabKey.startsWith(currentPrefix) && !liveTabKeys.has(tabKey),
    );

    if (removedEntries.length === 0) {
      return;
    }

    void Promise.allSettled(
      removedEntries.map(([, sessionId]) => closeSession({ sessionId })),
    ).finally(() => {
      for (const [tabKey, sessionId] of removedEntries) {
        clearSessionRegistration(tabKey, sessionId);
        delete exitedByTabKeyRef.current[tabKey];
        setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
      }
    });
  }, [args.getTabKey, args.tabs, args.workspaceId, clearSessionRegistration]);

  useEffect(() => {
    if (!activeTabKey) {
      setSessionExited(null);
      return;
    }
    setSessionExited(exitedByTabKeyRef.current[activeTabKey] ?? null);
  }, [activeTabKey, sessionVersion]);

  useEffect(() => {
    if (!args.activeTab || !activeTabKey || !args.isVisible || !args.terminalReady) {
      return;
    }

    const tabKey = activeTabKey;
    const attachSession = window.api?.terminal?.attachSession;
    const createSession = createSessionRef.current;
    const getSlotState = window.api?.terminal?.getSlotState;
    const detachSession = window.api?.terminal?.detachSession;
    const deliveryMode: "poll" | "push" = supportsPushTerminalOutput ? "push" : "poll";

    if (!attachSession || !detachSession) {
      setBridgeErrorForTabKey(
        setBridgeErrorByTabKey,
        tabKey,
        "CLI session bridge unavailable. Use bun run dev:desktop.",
      );
      return;
    }

    let cancelled = false;
    let attachedSessionId: string | null = null;

    const ensureActiveSession = async () => {
      const measured = terminalControllerRef.current.getSize();
      const cols = measured.cols || 80;
      const rows = measured.rows || 24;

      const hydrateAttachedSession = async (sessionId: string) => {
        registerSession(tabKey, sessionId);
        attachedSessionId = sessionId;

        const attached = await attachSession({
          sessionId,
          deliveryMode,
        });
        if (!attached.ok) {
          clearSessionRegistration(tabKey, sessionId);
          return false;
        }

        if (cancelled) {
          await detachSession({ sessionId });
          return true;
        }

        attachedSessionIdRef.current = sessionId;
        setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
        terminalControllerRef.current.clear();
        if (typeof attached.screenState === "string") {
          if (attached.screenState) {
            terminalControllerRef.current.write(attached.screenState);
          }
        } else if (attached.backlog) {
          terminalControllerRef.current.write(attached.backlog);
        }
        await handleTerminalResize(cols, rows);
        return true;
      };

      const rememberedSessionId = sessionIdByTabKeyRef.current[tabKey];
      if (rememberedSessionId) {
        const restored = await hydrateAttachedSession(rememberedSessionId);
        if (restored) {
          return;
        }
      }

      const slotKey = activeTabRef.current
        ? slotKeyForTabRef.current?.(activeTabRef.current)
        : null;
      if (slotKey && getSlotState) {
        const slotState = await getSlotState({ slotKey });
        if (
          slotState.sessionId &&
          (slotState.state === "running" || slotState.state === "background")
        ) {
          const restored = await hydrateAttachedSession(slotState.sessionId);
          if (restored) {
            return;
          }
        } else if (slotState.state === "exited") {
          exitedByTabKeyRef.current[tabKey] = {
            exitCode: slotState.exitCode ?? -1,
            signal: slotState.signal,
          };
          setSessionExited({
            exitCode: slotState.exitCode ?? -1,
            signal: slotState.signal,
          });
        }
      }

      const created = await createSession({
        tab: activeTabRef.current!,
        cols,
        rows,
        deliveryMode,
      });
      if (!created.ok || !created.sessionId) {
        setBridgeErrorForTabKey(
          setBridgeErrorByTabKey,
          tabKey,
          created.stderr?.trim() || "Failed to create CLI session.",
        );
        terminalControllerRef.current.writeln(
          `\r\n[error] ${created.stderr?.trim() || "failed to create CLI session."}`,
        );
        return;
      }

      registerSession(tabKey, created.sessionId);
      attachedSessionId = created.sessionId;
      if (cancelled) {
        await detachSession({ sessionId: created.sessionId });
        return;
      }
      attachedSessionIdRef.current = created.sessionId;
      setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
      setSessionExited(null);
    };

    void ensureActiveSession();

    return () => {
      cancelled = true;
      if (!attachedSessionId) {
        return;
      }
      if (attachedSessionIdRef.current === attachedSessionId) {
        attachedSessionIdRef.current = null;
      }
      void detachSession({ sessionId: attachedSessionId }).catch(() => {
        // Best-effort detach; host buffers output for later restore.
      });
    };
  }, [
    activeTabKey,
    args.isVisible,
    args.terminalReady,
    clearSessionRegistration,
    handleTerminalResize,
    registerSession,
    restartVersion,
    supportsPushTerminalOutput,
  ]);

  const restartActiveSession = useCallback(() => {
    const tabKey = activeTabKeyRef.current;
    const sessionId = tabKey
      ? (sessionIdByTabKeyRef.current[tabKey] ?? null)
      : null;
    if (tabKey) {
      delete exitedByTabKeyRef.current[tabKey];
      setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
    }
    setSessionExited(null);

    if (tabKey && sessionId) {
      if (attachedSessionIdRef.current === sessionId) {
        attachedSessionIdRef.current = null;
      }
      void window.api?.terminal?.closeSession?.({ sessionId });
      clearSessionRegistration(tabKey, sessionId);
    }

    setRestartVersion((value) => value + 1);
  }, [clearSessionRegistration]);

  return {
    activeSessionId,
    bridgeError,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveSession,
    sessionExited,
    writeToActiveSession,
  };
}
