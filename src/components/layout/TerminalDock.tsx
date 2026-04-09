import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { Eraser, SquareTerminal, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  openExternalUrl,
  shouldActivateExternalLinkWithModifier,
} from "@/lib/external-links";
import {
  getWorkspaceTerminalTabKey,
  type TerminalCreateSessionArgs,
} from "@/lib/terminal/types";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app.store";

const TERMINAL_TRANSCRIPT_STORAGE_KEY = "stave:terminal-tab-transcript:v2";
const TERMINAL_POLL_INTERVAL_MS = 120;
const TERMINAL_TRANSCRIPT_FLUSH_MS = 280;
const TERMINAL_SESSION_BUFFER_CHAR_LIMIT = 200_000;
const TERMINAL_TRANSCRIPT_CHAR_LIMIT = 300_000;
const DEFAULT_TERMINAL_FONT_FAMILY =
  '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace';
const DEFAULT_TERMINAL_FONT_SIZE = 13;
const DEFAULT_TERMINAL_LINE_HEIGHT = 1.2;

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

export function TerminalDock() {
  const [
    terminalDocked,
    terminalDockHeight,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    isDarkMode,
    setLayout,
    activeWorkspaceId,
    workspacePath,
    tasks,
    terminalTabs,
    activeTerminalTabId,
    createTerminalTab,
    closeTerminalTab,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.layout.terminalDocked,
          state.layout.terminalDockHeight ?? 210,
          state.settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
          state.settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
          state.settings.terminalLineHeight || DEFAULT_TERMINAL_LINE_HEIGHT,
          state.isDarkMode,
          state.setLayout,
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "",
          state.tasks,
          state.terminalTabs,
          state.activeTerminalTabId,
          state.createTerminalTab,
          state.closeTerminalTab,
        ] as const,
    ),
  );

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === activeTerminalTabId) ?? null,
    [activeTerminalTabId, terminalTabs],
  );
  const activeLinkedTask = useMemo(
    () => (activeTab?.linkedTaskId
      ? tasks.find((task) => task.id === activeTab.linkedTaskId) ?? null
      : null),
    [activeTab?.linkedTaskId, tasks],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
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

  const activeTabKey = activeTab
    ? getWorkspaceTerminalTabKey({
        workspaceId: activeWorkspaceId,
        terminalTabId: activeTab.id,
      })
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
        TERMINAL_TRANSCRIPT_STORAGE_KEY,
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

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    activeTabKeyRef.current = activeTabKey;
  }, [activeSessionId, activeTabKey]);

  useEffect(() => {
    if (transcriptLoadedRef.current) {
      return;
    }
    transcriptLoadedRef.current = true;
    const raw = window.localStorage.getItem(TERMINAL_TRANSCRIPT_STORAGE_KEY);
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
        TERMINAL_TRANSCRIPT_STORAGE_KEY,
        JSON.stringify(transcriptRef.current),
      );
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) {
      return;
    }
    let cancelled = false;

    const terminal = new Terminal({
      theme: resolveTerminalTheme(),
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      lineHeight: terminalLineHeight,
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
    lastResizeRef.current = { cols: 0, rows: 0 };

    const sendResize = () => {
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
    };

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        sendResize();
      });
    };

    const stabilizeTerminalMetrics = async () => {
      await waitForAnimationFrames(2);
      await waitForTerminalFont({
        fontFamily: terminalFontFamily,
        fontSize: terminalFontSize,
      });
      await waitForAnimationFrames(1);

      if (cancelled) {
        return;
      }

      fitAddon.fit();
      terminal.clearTextureAtlas();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
      sendResize();
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
    };
  }, [terminalFontFamily, terminalFontSize, terminalLineHeight]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }
    xtermRef.current.options.theme = resolveTerminalTheme();
  }, [isDarkMode]);

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
    previousWorkspaceIdRef.current = activeWorkspaceId;

    if (!previousWorkspaceId || previousWorkspaceId === activeWorkspaceId) {
      return;
    }

    const sessionIds = Object.values(sessionIdByTabKeyRef.current);
    void disposeSessionIds(sessionIds).finally(() => {
      resetRuntimeState();
      xtermRef.current?.clear();
    });
  }, [activeWorkspaceId]);

  useEffect(() => {
    return () => {
      void disposeSessionIds(Object.values(sessionIdByTabKeyRef.current));
      resetRuntimeState();
    };
  }, []);

  useEffect(() => {
    const liveEntries = Object.entries(sessionIdByTabKeyRef.current).filter(
      ([tabKey]) => tabKey.startsWith(`${activeWorkspaceId}:`),
    );
    const liveTabKeys = new Set(
      terminalTabs.map((tab) =>
        getWorkspaceTerminalTabKey({
          workspaceId: activeWorkspaceId,
          terminalTabId: tab.id,
        })),
    );
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
  }, [activeWorkspaceId, terminalTabs]);

  useEffect(() => {
    if (!terminalDocked || terminalTabs.length > 0 || !workspacePath) {
      return;
    }
    createTerminalTab({ cwd: workspacePath });
  }, [createTerminalTab, terminalDocked, terminalTabs.length, workspacePath]);

  useEffect(() => {
    if (!activeTab || !activeWorkspaceId || !workspacePath) {
      return;
    }

    const tabKey = getWorkspaceTerminalTabKey({
      workspaceId: activeWorkspaceId,
      terminalTabId: activeTab.id,
    });
    if (sessionIdByTabKeyRef.current[tabKey] || creatingSessionByTabKeyRef.current[tabKey]) {
      return;
    }

    const createSession = window.api?.terminal?.createSession;
    if (!createSession) {
      const message = "Terminal bridge unavailable. Use bun run dev:desktop.";
      setBridgeError(message);
      xtermRef.current?.writeln(`\r\n[error] ${message}`);
      return;
    }

    const linkedTask = activeTab.linkedTaskId
      ? tasks.find((task) => task.id === activeTab.linkedTaskId) ?? null
      : null;
    const request: TerminalCreateSessionArgs = {
      workspaceId: activeWorkspaceId,
      workspacePath,
      taskId: linkedTask?.id ?? null,
      taskTitle: linkedTask?.title ?? null,
      terminalTabId: activeTab.id,
      cwd: activeTab.cwd,
      cols: xtermRef.current?.cols ?? 80,
      rows: xtermRef.current?.rows ?? 24,
      deliveryMode: supportsPushTerminalOutput ? "push" : "poll",
    };

    creatingSessionByTabKeyRef.current[tabKey] = true;
    void createSession(request)
      .then((created) => {
        if (!created.ok || !created.sessionId) {
          setBridgeError("Failed to create terminal session.");
          xtermRef.current?.writeln(
            "\r\n[error] failed to create terminal session.",
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
  }, [activeTab, activeWorkspaceId, supportsPushTerminalOutput, tasks, workspacePath]);

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

  function clearActiveTerminal() {
    if (!activeTabKey) {
      return;
    }
    sessionBufferRef.current[activeTabKey] = "";
    transcriptRef.current[activeTabKey] = "";
    scheduleTranscriptFlush();
    xtermRef.current?.clear();
  }

  return (
    <div
      data-testid="terminal-dock"
      className="transition-[height] duration-200"
      style={{ height: `${terminalDockHeight}px` }}
    >
      <div className="h-full min-h-0 overflow-hidden bg-card">
        <section className="h-full min-h-0 overflow-hidden">
          <div className="flex h-9 items-center justify-between border-b border-border/80 px-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex items-center gap-2 font-medium text-foreground">
                <SquareTerminal className="size-4 text-muted-foreground" />
                <span className="truncate">{activeTab?.title ?? "Terminal"}</span>
              </span>
              {activeLinkedTask ? (
                <Badge variant="secondary" className="truncate rounded-sm text-[10px] uppercase tracking-[0.14em]">
                  {activeLinkedTask.title}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                onClick={clearActiveTerminal}
                title="Clear Terminal"
                aria-label="clear-terminal"
                disabled={!activeTab}
              >
                <Eraser className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                onClick={() => setLayout({ patch: { terminalDocked: false } })}
                title="Hide Terminal"
                aria-label="hide-terminal"
              >
                <SquareTerminal className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                onClick={() => {
                  if (activeTab) {
                    closeTerminalTab({ tabId: activeTab.id });
                  }
                }}
                title="Close Terminal Tab"
                aria-label="close-active-terminal-tab"
                disabled={!activeTab}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="h-[calc(100%-2.25rem)] overflow-hidden bg-terminal">
            {bridgeError ? (
              <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {bridgeError}
              </div>
            ) : null}
            <div
              ref={containerRef}
              className={cn(
                "h-full w-full",
                !activeTab && "opacity-60",
              )}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
