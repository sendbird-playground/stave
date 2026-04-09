import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import {
  openExternalUrl,
  shouldActivateExternalLinkWithModifier,
} from "@/lib/external-links";

const TERMINAL_POLL_INTERVAL_MS = 120;
const TERMINAL_TRANSCRIPT_FLUSH_MS = 280;
const TERMINAL_SESSION_BUFFER_CHAR_LIMIT = 200_000;
const TERMINAL_TRANSCRIPT_CHAR_LIMIT = 300_000;

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

async function waitForTerminalFont(args: {
  fontFamily: string;
  fontSize: number;
}) {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return;
  }

  const fonts = document.fonts;
  const fontSpec = `${args.fontSize}px ${args.fontFamily}`;
  const timeout = new Promise<void>((resolve) =>
    window.setTimeout(resolve, 1200),
  );

  try {
    await Promise.race([
      Promise.allSettled([fonts.ready, fonts.load(fontSpec)]).then(
        () => undefined,
      ),
      timeout,
    ]);
  } catch {
    // Ignore font loading failures and continue with best-effort fitting.
  }
}

function resolveTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);

  return {
    background: styles.getPropertyValue("--terminal").trim(),
    foreground: styles.getPropertyValue("--terminal-foreground").trim(),
    cursor: styles.getPropertyValue("--primary").trim(),
  };
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
  lineHeight: number;
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
  const sessionBufferRef = useRef<Record<string, string>>({});
  const scrollPositionByTabKeyRef = useRef<Record<string, number>>({});
  const pendingInputBySessionRef = useRef<Record<string, string>>({});
  const writeInFlightBySessionRef = useRef<Record<string, boolean>>({});
  const creatingSessionByTabKeyRef = useRef<Record<string, boolean>>({});
  const transcriptRef = useRef<Record<string, string>>({});
  const transcriptFlushTimerRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number }>({
    cols: 0,
    rows: 0,
  });
  const transcriptLoadedRef = useRef(false);
  const previousWorkspaceIdRef = useRef<string>("");

  const [bridgeError, setBridgeError] = useState("");
  const [terminalReady, setTerminalReady] = useState(false);
  const [runtimeVersion, setRuntimeVersion] = useState(0);

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
    sessionBufferRef.current = {};
    scrollPositionByTabKeyRef.current = {};
    pendingInputBySessionRef.current = {};
    writeInFlightBySessionRef.current = {};
    creatingSessionByTabKeyRef.current = {};
    previousActiveTabKeyRef.current = null;
    activeSessionIdRef.current = null;
    activeTabKeyRef.current = null;
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
      TERMINAL_SESSION_BUFFER_CHAR_LIMIT,
    );
    flushTerminalInput(args.sessionId);
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
          TERMINAL_SESSION_BUFFER_CHAR_LIMIT,
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

    sessionBufferRef.current[tabKey] = appendTerminalText(
      sessionBufferRef.current[tabKey] ?? transcriptRef.current[tabKey] ?? "",
      args.output,
      TERMINAL_SESSION_BUFFER_CHAR_LIMIT,
    );
    transcriptRef.current[tabKey] = appendTerminalText(
      transcriptRef.current[tabKey] ?? "",
      args.output,
      TERMINAL_TRANSCRIPT_CHAR_LIMIT,
    );

    if (activeTabKeyRef.current === tabKey) {
      xtermRef.current?.write(args.output);
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
      return;
    }
    if (container.offsetWidth <= 0 || container.offsetHeight <= 0) {
      return;
    }
    fitAddon.fit();
    if (
      lastResizeRef.current.cols === terminal.cols &&
      lastResizeRef.current.rows === terminal.rows
    ) {
      return;
    }
    lastResizeRef.current = {
      cols: terminal.cols,
      rows: terminal.rows,
    };
    const resizeSession = window.api?.terminal?.resizeSession;
    const sessionId = activeSessionIdRef.current;
    if (sessionId && resizeSession) {
      void resizeSession({
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    }
  }

  function scheduleResize() {
    if (resizeFrameRef.current !== null) {
      return;
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      resizeActiveSession();
    });
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

    const terminal = new Terminal({
      theme: resolveTerminalTheme(),
      fontFamily: args.fontFamily,
      fontSize: args.fontSize,
      lineHeight: args.lineHeight,
      letterSpacing: 0,
      cursorBlink: true,
      convertEol: true,
      disableStdin: false,
    });
    const fitAddon = new FitAddon();
    const activateExternalLink = (event: MouseEvent, uri: string) => {
      if (!shouldActivateExternalLinkWithModifier({
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      })) {
        return;
      }
      void openExternalUrl({ url: uri });
    };
    const osc8LinkHandler = {
      activate: (event: MouseEvent, uri: string) => activateExternalLink(event, uri),
      allowNonHttpProtocols: false,
    };
    const webLinksAddon = new WebLinksAddon((event: MouseEvent, uri: string) => {
      activateExternalLink(event, uri);
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.options.linkHandler = osc8LinkHandler;
    terminal.open(containerRef.current);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    lastResizeRef.current = { cols: 0, rows: 0 };

    const stabilizeTerminalMetrics = async () => {
      await waitForAnimationFrames(2);
      await waitForTerminalFont({
        fontFamily: args.fontFamily,
        fontSize: args.fontSize,
      });
      await waitForAnimationFrames(1);

      if (cancelled) {
        return;
      }

      fitAddon.fit();
      terminal.clearTextureAtlas();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
      resizeActiveSession();
      if (!cancelled) {
        setTerminalReady(true);
      }
    };

    const ro = new ResizeObserver(() => scheduleResize());
    ro.observe(containerRef.current);

    const disposable = terminal.onData((input) => {
      const currentSessionId = activeSessionIdRef.current;
      if (!currentSessionId) {
        return;
      }
      enqueueTerminalInput({ sessionId: currentSessionId, input });
    });

    void stabilizeTerminalMetrics();

    return () => {
      cancelled = true;
      setTerminalReady(false);
      disposable.dispose();
      ro.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [args.fontFamily, args.fontSize, args.lineHeight]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }
    xtermRef.current.options.theme = resolveTerminalTheme();
  }, [args.isDarkMode]);

  useEffect(() => {
    if (!args.isVisible || !xtermRef.current) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await waitForAnimationFrames(2);
      await waitForTerminalFont({
        fontFamily: args.fontFamily,
        fontSize: args.fontSize,
      });
      await waitForAnimationFrames(1);
      if (cancelled) {
        return;
      }
      xtermRef.current?.clearTextureAtlas();
      xtermRef.current?.refresh(0, Math.max(0, (xtermRef.current?.rows ?? 1) - 1));
      resizeActiveSession();
    })();

    return () => {
      cancelled = true;
    };
  }, [args.fontFamily, args.fontSize, args.isVisible, args.activeTabId]);

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

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = args.workspaceId;

    if (!previousWorkspaceId || previousWorkspaceId === args.workspaceId) {
      return;
    }

    const sessionIds = Object.values(sessionIdByTabKeyRef.current);
    void disposeSessionIds(sessionIds).finally(() => {
      resetRuntimeState();
      xtermRef.current?.clear();
    });
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
        delete sessionBufferRef.current[tabKey];
        delete scrollPositionByTabKeyRef.current[tabKey];
        delete pendingInputBySessionRef.current[sessionId];
        delete writeInFlightBySessionRef.current[sessionId];
        delete creatingSessionByTabKeyRef.current[tabKey];
      }
      setRuntimeVersion((value) => value + 1);
    });
  }, [args.getTabKey, args.tabs, args.workspaceId]);

  useEffect(() => {
    if (!args.activeTab || !args.workspaceId) {
      return;
    }

    const tabKey = args.getTabKey(args.activeTab);
    if (sessionIdByTabKeyRef.current[tabKey] || creatingSessionByTabKeyRef.current[tabKey]) {
      return;
    }

    creatingSessionByTabKeyRef.current[tabKey] = true;
    void args.createSession({
      tab: args.activeTab,
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
        sessionBufferRef.current[tabKey] = sessionBufferRef.current[tabKey]
          ?? transcriptRef.current[tabKey]
          ?? "";
        pendingInputBySessionRef.current[created.sessionId] = "";
        writeInFlightBySessionRef.current[created.sessionId] = false;
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
      scrollPositionByTabKeyRef.current[previousTabKey] =
        xtermRef.current.buffer.active.baseY;
    }

    previousActiveTabKeyRef.current = activeTabKey;
    xtermRef.current.clear();

    if (!activeTabKey) {
      return;
    }

    const buffer = sessionBufferRef.current[activeTabKey]
      ?? transcriptRef.current[activeTabKey]
      ?? "";
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

  function clearActiveTranscript() {
    if (!activeTabKey) {
      return;
    }
    sessionBufferRef.current[activeTabKey] = "";
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
    delete sessionBufferRef.current[activeTabKey];
    delete scrollPositionByTabKeyRef.current[activeTabKey];
    delete creatingSessionByTabKeyRef.current[activeTabKey];
    transcriptRef.current[activeTabKey] = "";
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
    writeToActiveSession,
  };
}
