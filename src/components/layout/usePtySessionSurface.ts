import { useEffect, useRef, useState } from "react";
import { init as initGhosttyWasm, Terminal, FitAddon } from "ghostty-web";
import {
  focusTerminalSurface,
  shouldCreatePtySession,
} from "@/components/layout/pty-session-surface.utils";

const TERMINAL_POLL_INTERVAL_MS = 120;
const TERMINAL_TRANSCRIPT_FLUSH_MS = 280;
const TERMINAL_TRANSCRIPT_CHAR_LIMIT = 300_000;
/** Cap for pending input buffer to prevent unbounded memory growth. */
const TERMINAL_INPUT_BUFFER_CHAR_LIMIT = 200_000;
/** Maximum RAF attempts when auto-focusing the terminal after tab switch. */
const AUTO_FOCUS_MAX_ATTEMPTS = 60;

/**
 * Write data to a ghostty-web Terminal while preserving the current scroll
 * position.  ghostty-web's `writeInternal` unconditionally calls
 * `scrollToBottom()` after every write, which rips the viewport away from the
 * user's scroll position.  We work around this by saving `getViewportY()`
 * before the write and restoring it afterwards when the user is scrolled up.
 */
function writePreservingScroll(terminal: Terminal, data: string) {
  const viewportY =
    typeof terminal.getViewportY === "function"
      ? terminal.getViewportY()
      : 0;
  terminal.write(data);
  // viewportY > 0 means the user was scrolled up into history.
  if (viewportY > 0) {
    terminal.scrollToLine(viewportY);
  }
}

let ghosttyWasmReady: Promise<void> | null = null;

function ensureGhosttyWasm(): Promise<void> {
  if (!ghosttyWasmReady) {
    ghosttyWasmReady = initGhosttyWasm();
  }
  return ghosttyWasmReady;
}

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    function step(remaining: number) {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    }
    step(count);
  });
}

function resolveTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);

  return {
    background: styles.getPropertyValue("--terminal").trim(),
    foreground: styles.getPropertyValue("--terminal-foreground").trim(),
    cursor: styles.getPropertyValue("--primary").trim(),
  };
}

type ResolvedTerminalTheme = ReturnType<typeof resolveTerminalTheme>;

function getResolvedTerminalThemeKey(theme: ResolvedTerminalTheme) {
  return `${theme.background}::${theme.foreground}::${theme.cursor}`;
}

function applyTerminalTheme(args: {
  terminal: Terminal;
  theme: ResolvedTerminalTheme;
}) {
  args.terminal.renderer?.setTheme(args.theme);

  if (args.terminal.element) {
    args.terminal.element.style.backgroundColor = args.theme.background;
    args.terminal.element.style.color = args.theme.foreground;
  }

  if (args.terminal.renderer && args.terminal.wasmTerm) {
    args.terminal.renderer.render(
      args.terminal.wasmTerm,
      true,
      args.terminal.getViewportY(),
      args.terminal,
    );
  }
}

function appendTerminalText(
  existing: string,
  nextChunk: string,
  limit: number,
) {
  if (!nextChunk) {
    return existing;
  }
  const combined = `${existing}${nextChunk}`;
  if (combined.length <= limit) {
    return combined;
  }

  const overflowStart = combined.length - limit;
  const nextLineBreak = combined.indexOf("\n", overflowStart);
  return nextLineBreak >= 0
    ? combined.slice(nextLineBreak + 1)
    : combined.slice(-limit);
}

function appendTerminalInput(
  existing: string,
  nextChunk: string,
  limit: number,
) {
  if (!nextChunk) {
    return existing;
  }
  const combined = `${existing}${nextChunk}`;
  return combined.length <= limit ? combined : combined.slice(-limit);
}

type CreateSessionResult = {
  ok: boolean;
  sessionId?: string;
  stderr?: string;
};

export function usePtySessionSurface<TTab extends { id: string }>(args: {
  activeTab: TTab | null;
  activeTabId: string | null;
  tabs: readonly TTab[];
  workspaceId: string;
  transcriptStorageKey: string;
  isVisible: boolean;
  fontFamily: string;
  fontSize: number;
  isDarkMode: boolean;
  getTabKey: (tab: TTab) => string;
  createSession: (args: {
    tab: TTab;
    cols: number;
    rows: number;
    deliveryMode: "poll" | "push";
  }) => Promise<CreateSessionResult>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeTabKeyRef = useRef<string | null>(null);
  const previousActiveTabKeyRef = useRef<string | null>(null);
  const sessionIdByTabKeyRef = useRef<Record<string, string>>({});
  const tabKeyBySessionIdRef = useRef<Record<string, string>>({});
  const scrollPositionByTabKeyRef = useRef<Record<string, number>>({});
  const pendingInputBySessionRef = useRef<Record<string, string>>({});
  const writeInFlightBySessionRef = useRef<Record<string, boolean>>({});
  const flushScheduledBySessionRef = useRef<Record<string, boolean>>({});
  const creatingSessionByTabKeyRef = useRef<Record<string, boolean>>({});
  // Unified transcript: single buffer per tab for both live output and persistence.
  // Replaces the previous dual-buffer (sessionBuffer + transcript) system.
  const transcriptRef = useRef<Record<string, string>>({});
  const transcriptFlushTimerRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeInFlightRef = useRef(false);
  const pendingResizeRef = useRef(false);
  /** Suppress ResizeObserver callbacks while an IME composition is active. */
  const isComposingRef = useRef(false);
  const lastResizeRef = useRef<{ cols: number; rows: number }>({
    cols: 0,
    rows: 0,
  });
  const transcriptLoadedRef = useRef(false);
  const previousWorkspaceIdRef = useRef<string>("");
  // Tracks which sessions have exited (keyed by tabKey).
  const exitedByTabKeyRef = useRef<Record<string, { exitCode: number; signal?: number }>>({});
  const terminalThemeKeyRef = useRef<string | null>(null);
  const themeSyncFrameRef = useRef<number | null>(null);

  const [bridgeError, setBridgeError] = useState("");
  const [terminalReady, setTerminalReady] = useState(false);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [sessionExited, setSessionExited] = useState<{
    exitCode: number;
    signal?: number;
  } | null>(null);

  const supportsPushTerminalOutput =
    typeof window !== "undefined" &&
    Boolean(
      window.api?.terminal?.subscribeSessionOutput &&
        window.api?.terminal?.setSessionDeliveryMode,
    );

  const activeTabKey = args.activeTab
    ? args.getTabKey(args.activeTab)
    : null;
  const activeSessionId = activeTabKey
    ? (sessionIdByTabKeyRef.current[activeTabKey] ?? null)
    : null;

  function scheduleTranscriptFlush() {
    if (transcriptFlushTimerRef.current !== null) {
      return;
    }

    transcriptFlushTimerRef.current = window.setTimeout(() => {
      transcriptFlushTimerRef.current = null;
      window.localStorage.setItem(
        args.transcriptStorageKey,
        JSON.stringify(transcriptRef.current),
      );
    }, TERMINAL_TRANSCRIPT_FLUSH_MS);
  }

  function resetRuntimeState() {
    sessionIdByTabKeyRef.current = {};
    tabKeyBySessionIdRef.current = {};
    scrollPositionByTabKeyRef.current = {};
    pendingInputBySessionRef.current = {};
    writeInFlightBySessionRef.current = {};
    flushScheduledBySessionRef.current = {};
    creatingSessionByTabKeyRef.current = {};
    previousActiveTabKeyRef.current = null;
    activeSessionIdRef.current = null;
    activeTabKeyRef.current = null;
    resizeInFlightRef.current = false;
    pendingResizeRef.current = false;
    setRuntimeVersion((value) => value + 1);
  }

  async function disposeSessionIds(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return;
    }

    const closeSessionApi = window.api?.terminal?.closeSession;
    if (closeSessionApi) {
      await Promise.allSettled(
        sessionIds.map((sessionId) => closeSessionApi({ sessionId })),
      );
    }
  }

  function enqueueTerminalInput(args: { sessionId: string; input: string }) {
    pendingInputBySessionRef.current[args.sessionId] = appendTerminalInput(
      pendingInputBySessionRef.current[args.sessionId] ?? "",
      args.input,
      TERMINAL_INPUT_BUFFER_CHAR_LIMIT,
    );
    // Batch keystrokes arriving in the same event-loop tick into one IPC call.
    if (!flushScheduledBySessionRef.current[args.sessionId]) {
      flushScheduledBySessionRef.current[args.sessionId] = true;
      queueMicrotask(() => {
        flushScheduledBySessionRef.current[args.sessionId] = false;
        flushTerminalInput(args.sessionId);
      });
    }
  }

  function flushTerminalInput(sessionId: string) {
    if (writeInFlightBySessionRef.current[sessionId]) {
      return;
    }

    const input = pendingInputBySessionRef.current[sessionId];
    if (!input) {
      return;
    }

    const writeSession = window.api?.terminal?.writeSession;
    if (!writeSession) {
      xtermRef.current?.writeln("\r\n[error] terminal bridge unavailable.");
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
        xtermRef.current?.writeln(
          "\r\n[error] failed to write terminal input.",
        );
      })
      .finally(() => {
        writeInFlightBySessionRef.current[sessionId] = false;
        if (pendingInputBySessionRef.current[sessionId]) {
          flushTerminalInput(sessionId);
        }
      });
  }

  function applyTerminalOutput(args: { sessionId: string; output: string }) {
    if (!args.output) {
      return;
    }

    const tabKey = tabKeyBySessionIdRef.current[args.sessionId];
    if (!tabKey) {
      return;
    }

    // Unified transcript: single rolling buffer per tab.
    transcriptRef.current[tabKey] = appendTerminalText(
      transcriptRef.current[tabKey] ?? "",
      args.output,
      TERMINAL_TRANSCRIPT_CHAR_LIMIT,
    );

    if (activeTabKeyRef.current === tabKey && xtermRef.current) {
      writePreservingScroll(xtermRef.current, args.output);
    }

    scheduleTranscriptFlush();
  }

  async function syncTerminalOutput() {
    const readSession = window.api?.terminal?.readSession;
    const sessionIds = Object.values(sessionIdByTabKeyRef.current);
    if (!readSession || sessionIds.length === 0) {
      return;
    }

    const reads = await Promise.all(
      sessionIds.map(
        async (sessionId) =>
          [sessionId, await readSession({ sessionId })] as const,
      ),
    );

    for (const [sessionId, read] of reads) {
      if (!read.ok || !read.output) {
        continue;
      }
      applyTerminalOutput({ sessionId, output: read.output });
    }
  }

  function resizeActiveSession() {
    const terminal = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    const container = containerRef.current;
    if (!terminal || !fitAddon || !container) {
      resizeInFlightRef.current = false;
      return;
    }
    if (container.offsetWidth <= 0 || container.offsetHeight <= 0) {
      resizeInFlightRef.current = false;
      return;
    }
    // PTY-first resize: calculate proposed dimensions, resize PTY first,
    // then apply to the frontend terminal. This prevents shell output from
    // being formatted for stale dimensions during the resize window.
    const proposed = fitAddon.proposeDimensions();
    if (!proposed) {
      resizeInFlightRef.current = false;
      return;
    }
    const cols = Math.max(1, proposed.cols);
    const rows = Math.max(1, proposed.rows);
    if (
      lastResizeRef.current.cols === cols &&
      lastResizeRef.current.rows === rows
    ) {
      resizeInFlightRef.current = false;
      return;
    }
    lastResizeRef.current = { cols, rows };
    const resizeSession = window.api?.terminal?.resizeSession;
    const sessionId = activeSessionIdRef.current;
    if (sessionId && resizeSession) {
      void resizeSession({ sessionId, cols, rows });
    }
    terminal.resize(cols, rows);

    // If another resize was requested while this one was in-flight,
    // schedule one more pass to pick up the latest dimensions.
    resizeInFlightRef.current = false;
    if (pendingResizeRef.current) {
      pendingResizeRef.current = false;
      scheduleResize();
    }
  }

  function syncTerminalTheme(args: { force?: boolean } = {}) {
    const terminal = xtermRef.current;
    if (!terminal) {
      return;
    }

    const theme = resolveTerminalTheme();
    const themeKey = getResolvedTerminalThemeKey(theme);
    if (!args.force && terminalThemeKeyRef.current === themeKey) {
      return;
    }

    terminalThemeKeyRef.current = themeKey;
    applyTerminalTheme({ terminal, theme });
  }

  function scheduleTerminalThemeSync(args: { force?: boolean } = {}) {
    if (themeSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(themeSyncFrameRef.current);
    }

    themeSyncFrameRef.current = window.requestAnimationFrame(() => {
      themeSyncFrameRef.current = null;
      syncTerminalTheme(args);
    });
  }

  /**
   * RAF-debounced resize with inflight + pending flags.
   * During window drag, rapid ResizeObserver callbacks are coalesced:
   * only one RAF runs at a time, and if more arrive during that frame,
   * exactly one follow-up is scheduled — never a backlog.
   */
  function scheduleResize() {
    if (resizeInFlightRef.current) {
      // A resize RAF is already queued; mark that we need another pass.
      pendingResizeRef.current = true;
      return;
    }
    resizeInFlightRef.current = true;
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      resizeActiveSession();
    });
  }

  function scheduleTerminalFocus() {
    let focusAttempt = 0;
    let focusCancelled = false;

    function tryFocus() {
      if (focusCancelled) {
        return;
      }

      const didFocus = focusTerminalSurface({
        terminal: xtermRef.current,
        container: containerRef.current,
      });
      if (didFocus) {
        return;
      }

      focusAttempt += 1;
      if (focusAttempt < AUTO_FOCUS_MAX_ATTEMPTS) {
        window.requestAnimationFrame(tryFocus);
      }
    }

    window.requestAnimationFrame(tryFocus);

    return () => {
      focusCancelled = true;
    };
  }

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    activeTabKeyRef.current = activeTabKey;
  }, [activeSessionId, activeTabKey]);

  useEffect(() => {
    if (transcriptLoadedRef.current) {
      return;
    }
    transcriptLoadedRef.current = true;
    const raw = window.localStorage.getItem(args.transcriptStorageKey);
    try {
      transcriptRef.current = raw
        ? (JSON.parse(raw) as Record<string, string>)
        : {};
    } catch {
      transcriptRef.current = {};
    }

    return () => {
      if (transcriptFlushTimerRef.current !== null) {
        window.clearTimeout(transcriptFlushTimerRef.current);
        transcriptFlushTimerRef.current = null;
      }
      window.localStorage.setItem(
        args.transcriptStorageKey,
        JSON.stringify(transcriptRef.current),
      );
    };
  }, [args.transcriptStorageKey]);

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) {
      return;
    }
    let cancelled = false;

    const bootstrap = async () => {
      await ensureGhosttyWasm();
      if (cancelled || !containerRef.current) {
        return;
      }

      // Preload terminal font before creating the terminal so ghostty-web
      // measures correct character cell dimensions on first render.
      if (typeof document !== "undefined" && "fonts" in document) {
        const fontSpec = `${args.fontSize}px ${args.fontFamily}`;
        try {
          await Promise.race([
            document.fonts.load(fontSpec),
            new Promise<void>((r) => setTimeout(r, 1500)),
          ]);
        } catch {
          // Best-effort; continue even if font loading fails.
        }
        if (cancelled) {
          return;
        }
      }

      const terminal = new Terminal({
        theme: resolveTerminalTheme(),
        fontFamily: args.fontFamily,
        fontSize: args.fontSize,
        cursorBlink: false,
        convertEol: true,
        disableStdin: false,
      });
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;
      lastResizeRef.current = { cols: 0, rows: 0 };
      terminalThemeKeyRef.current = null;

      const ro = new ResizeObserver(() => {
        // Skip resize during IME composition — the browser may
        // temporarily insert text nodes into the contenteditable
        // container, causing a micro layout shift.  Resizing during
        // this window causes the terminal to jump.
        if (isComposingRef.current) {
          return;
        }
        scheduleResize();
      });
      ro.observe(containerRef.current);

      const disposable = terminal.onData((input) => {
        const currentSessionId = activeSessionIdRef.current;
        if (!currentSessionId) {
          return;
        }
        enqueueTerminalInput({ sessionId: currentSessionId, input });
      });

      // Enable cursor blink only when focused to save CPU in background tabs.
      const container = containerRef.current;
      const onFocusIn = () => { terminal.options.cursorBlink = true; };
      const onFocusOut = () => { terminal.options.cursorBlink = false; };
      container.addEventListener("focusin", onFocusIn);
      container.addEventListener("focusout", onFocusOut);

      // Track IME composition state to guard ResizeObserver.
      const onCompositionStart = () => { isComposingRef.current = true; };
      const onCompositionEnd = () => {
        isComposingRef.current = false;
        // Apply any resize that was deferred while composing.
        scheduleResize();
      };
      container.addEventListener("compositionstart", onCompositionStart);
      container.addEventListener("compositionend", onCompositionEnd);

      await waitForAnimationFrames(2);
      if (cancelled) {
        disposable.dispose();
        ro.disconnect();
        terminal.dispose();
        return;
      }

      fitAddon.fit();
      resizeActiveSession();
      scheduleTerminalThemeSync({ force: true });

      if (!cancelled) {
        setTerminalReady(true);
      }

      // Store cleanup references for the effect teardown
      cleanupRef.current = () => {
        container.removeEventListener("focusin", onFocusIn);
        container.removeEventListener("focusout", onFocusOut);
        container.removeEventListener("compositionstart", onCompositionStart);
        container.removeEventListener("compositionend", onCompositionEnd);
        disposable.dispose();
        ro.disconnect();
        terminal.dispose();
      };
    };

    const cleanupRef = { current: () => {} };

    void bootstrap();

    return () => {
      cancelled = true;
      setTerminalReady(false);
      cleanupRef.current();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (themeSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(themeSyncFrameRef.current);
        themeSyncFrameRef.current = null;
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [args.fontFamily, args.fontSize]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") {
      return;
    }

    const themeStyleIds = new Set(["stave-custom-theme", "stave-theme-overrides"]);
    const isTrackedThemeNode = (node: Node | null) => {
      if (!node) {
        return false;
      }

      if (node instanceof Element) {
        return themeStyleIds.has(node.id) || themeStyleIds.has(node.parentElement?.id ?? "");
      }

      return themeStyleIds.has(node.parentElement?.id ?? "");
    };

    const observer = new MutationObserver((records) => {
      const shouldSync = records.some((record) => {
        if (record.target === document.documentElement) {
          return true;
        }

        if (isTrackedThemeNode(record.target)) {
          return true;
        }

        return [...record.addedNodes, ...record.removedNodes].some(isTrackedThemeNode);
      });

      if (shouldSync) {
        scheduleTerminalThemeSync({ force: true });
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(document.head, {
      attributes: true,
      attributeFilter: ["id"],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    scheduleTerminalThemeSync({ force: true });
  }, [args.isDarkMode]);

  useEffect(() => {
    if (!args.isVisible || !xtermRef.current) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await waitForAnimationFrames(2);
      if (cancelled) {
        return;
      }
      resizeActiveSession();
    })();

    return () => {
      cancelled = true;
    };
  }, [args.isVisible, args.activeTabId]);

  useEffect(() => {
    if (!supportsPushTerminalOutput) {
      return;
    }

    const subscribeSessionOutput = window.api?.terminal?.subscribeSessionOutput;
    if (!subscribeSessionOutput) {
      return;
    }

    return subscribeSessionOutput(({ sessionId, output }) => {
      if (!tabKeyBySessionIdRef.current[sessionId]) {
        return;
      }
      applyTerminalOutput({ sessionId, output });
    });
  }, [supportsPushTerminalOutput]);

  // Subscribe to PTY process exit events to display exit status in the terminal.
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

      // Write a visible exit marker into the terminal.
      const signalHint = signal ? ` (signal ${signal})` : "";
      const exitMessage = exitCode === 0
        ? `\r\n\x1b[2m[process exited with code 0${signalHint}]\x1b[0m\r\n`
        : `\r\n\x1b[33m[process exited with code ${exitCode}${signalHint}]\x1b[0m\r\n`;
      xtermRef.current?.write(exitMessage);

      // Append to transcript so it persists across tab switches.
      transcriptRef.current[tabKey] = appendTerminalText(
        transcriptRef.current[tabKey] ?? "",
        exitMessage,
        TERMINAL_TRANSCRIPT_CHAR_LIMIT,
      );
      scheduleTranscriptFlush();

      // Update React state if this is the currently active tab.
      if (activeTabKeyRef.current === tabKey) {
        setSessionExited({ exitCode, signal });
      }
    });
  }, []);

  useEffect(() => {
    if (supportsPushTerminalOutput) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      await syncTerminalOutput();

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
  }, [runtimeVersion, supportsPushTerminalOutput]);

  // When the active workspace changes, clear the terminal display and reset
  // transient resize / inflight flags so the newly-active tab renders
  // cleanly.  We intentionally do NOT kill the PTY sessions — they stay
  // alive in the background keyed by their tabKey (which includes workspaceId).
  // This allows the user to switch to another workspace and come back without
  // losing a running Claude CLI session.
  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = args.workspaceId;

    if (!previousWorkspaceId || previousWorkspaceId === args.workspaceId) {
      return;
    }

    // Reset only transient UI state — preserve session mappings.
    previousActiveTabKeyRef.current = null;
    activeSessionIdRef.current = null;
    activeTabKeyRef.current = null;
    resizeInFlightRef.current = false;
    pendingResizeRef.current = false;
    lastResizeRef.current = { cols: 0, rows: 0 };

    xtermRef.current?.clear();
    // Bump runtimeVersion so dependent effects re-evaluate with the
    // new workspace's tabs.
    setRuntimeVersion((value) => value + 1);
  }, [args.workspaceId]);

  useEffect(() => {
    return () => {
      void disposeSessionIds(Object.values(sessionIdByTabKeyRef.current));
      resetRuntimeState();
    };
  }, []);

  useEffect(() => {
    const liveEntries = Object.entries(sessionIdByTabKeyRef.current).filter(
      ([tabKey]) => tabKey.startsWith(`${args.workspaceId}:`),
    );
    const liveTabKeys = new Set(args.tabs.map((tab) => args.getTabKey(tab)));
    const removedEntries = liveEntries.filter(([tabKey]) => !liveTabKeys.has(tabKey));
    if (removedEntries.length === 0) {
      return;
    }

    void disposeSessionIds(removedEntries.map(([, sessionId]) => sessionId)).finally(() => {
      for (const [tabKey, sessionId] of removedEntries) {
        delete sessionIdByTabKeyRef.current[tabKey];
        delete tabKeyBySessionIdRef.current[sessionId];
        delete scrollPositionByTabKeyRef.current[tabKey];
        delete pendingInputBySessionRef.current[sessionId];
        delete writeInFlightBySessionRef.current[sessionId];
        delete creatingSessionByTabKeyRef.current[tabKey];
      }
      setRuntimeVersion((value) => value + 1);
    });
  }, [args.getTabKey, args.tabs, args.workspaceId]);

  useEffect(() => {
    // Only spawn a new backend session when the surface is actually visible.
    // Workspace/task switches can preserve an "active" tab id in state even
    // while the user is looking at a task surface. Creating PTYs in that
    // hidden state causes fresh CLI sessions to appear just by navigating.
    if (!args.activeTab || !shouldCreatePtySession({
      isVisible: args.isVisible,
      workspaceId: args.workspaceId,
      hasActiveTab: true,
    })) {
      return;
    }

    const activeTab = args.activeTab;
    const tabKey = args.getTabKey(activeTab);
    if (sessionIdByTabKeyRef.current[tabKey] || creatingSessionByTabKeyRef.current[tabKey]) {
      return;
    }

    creatingSessionByTabKeyRef.current[tabKey] = true;
    void args.createSession({
      tab: activeTab,
      cols: xtermRef.current?.cols ?? 80,
      rows: xtermRef.current?.rows ?? 24,
      deliveryMode: supportsPushTerminalOutput ? "push" : "poll",
    })
      .then((created) => {
        if (!created.ok || !created.sessionId) {
          setBridgeError(created.stderr?.trim() || "Failed to create terminal session.");
          xtermRef.current?.writeln(
            `\r\n[error] ${created.stderr?.trim() || "failed to create terminal session."}`,
          );
          return;
        }

        setBridgeError("");
        sessionIdByTabKeyRef.current[tabKey] = created.sessionId;
        tabKeyBySessionIdRef.current[created.sessionId] = tabKey;
        pendingInputBySessionRef.current[created.sessionId] = "";
        writeInFlightBySessionRef.current[created.sessionId] = false;
        delete exitedByTabKeyRef.current[tabKey];
        setSessionExited(null);
        setRuntimeVersion((value) => value + 1);
      })
      .finally(() => {
        delete creatingSessionByTabKeyRef.current[tabKey];
      });
  }, [args, supportsPushTerminalOutput]);

  useEffect(() => {
    if (!xtermRef.current || !terminalReady) {
      return;
    }

    const previousTabKey = previousActiveTabKeyRef.current;
    if (previousTabKey && previousTabKey !== activeTabKey) {
      // Save the viewport scroll offset so we can restore it when the
      // user switches back.  `getViewportY()` returns the number of
      // lines scrolled up from the bottom (0 = at bottom).
      scrollPositionByTabKeyRef.current[previousTabKey] =
        typeof xtermRef.current.getViewportY === "function"
          ? xtermRef.current.getViewportY()
          : 0;
    }

    previousActiveTabKeyRef.current = activeTabKey;
    xtermRef.current.clear();

    if (!activeTabKey) {
      setSessionExited(null);
      return;
    }

    // Restore exit status for the newly active tab.
    const exitInfo = exitedByTabKeyRef.current[activeTabKey] ?? null;
    setSessionExited(exitInfo);

    // Unified transcript: single buffer for both live output and persistence.
    const buffer = transcriptRef.current[activeTabKey] ?? "";
    if (buffer) {
      xtermRef.current.write(buffer);
    }
    const scrollPosition = scrollPositionByTabKeyRef.current[activeTabKey];
    if (typeof scrollPosition === "number") {
      window.requestAnimationFrame(() => {
        xtermRef.current?.scrollToLine(scrollPosition);
      });
    }
  }, [activeTabKey, runtimeVersion, terminalReady]);

  useEffect(() => {
    if (!args.isVisible || !activeTabKey || !terminalReady) {
      return;
    }

    return scheduleTerminalFocus();
  }, [args.isVisible, activeTabKey, runtimeVersion, terminalReady]);

  function clearActiveTranscript() {
    if (!activeTabKey) {
      return;
    }
    transcriptRef.current[activeTabKey] = "";
    scheduleTranscriptFlush();
    xtermRef.current?.clear();
  }

  function writeToActiveSession(input: string) {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || !input) {
      return false;
    }
    enqueueTerminalInput({ sessionId, input });
    return true;
  }

  function restartActiveSession() {
    if (!activeTabKey) {
      return;
    }

    const sessionId = sessionIdByTabKeyRef.current[activeTabKey];
    if (sessionId) {
      void disposeSessionIds([sessionId]);
      delete tabKeyBySessionIdRef.current[sessionId];
      delete pendingInputBySessionRef.current[sessionId];
      delete writeInFlightBySessionRef.current[sessionId];
    }
    delete sessionIdByTabKeyRef.current[activeTabKey];
    delete scrollPositionByTabKeyRef.current[activeTabKey];
    delete creatingSessionByTabKeyRef.current[activeTabKey];
    delete exitedByTabKeyRef.current[activeTabKey];
    transcriptRef.current[activeTabKey] = "";
    setSessionExited(null);
    scheduleTranscriptFlush();
    xtermRef.current?.clear();
    setRuntimeVersion((value) => value + 1);
  }

  return {
    activeSessionId,
    bridgeError,
    clearActiveTranscript,
    containerRef,
    restartActiveSession,
    sessionExited,
    terminalReady,
    writeToActiveSession,
  };
}
