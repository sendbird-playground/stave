import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Eraser, Plus, SquareTerminal, Trash2, X } from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app.store";

interface TerminalTab {
  id: string;
  label: string;
}

interface WorkspaceTerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  sessionBuffers: Record<string, string>;
}

const TERMINAL_TRANSCRIPT_STORAGE_KEY = "stave:terminal-task-transcript:v1";
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
    terminalDockHeight,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    isDarkMode,
    setLayout,
    activeTaskId,
    activeWorkspaceId,
    workspaceCwd,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.layout.terminalDockHeight ?? 210,
          state.settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
          state.settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
          state.settings.terminalLineHeight || DEFAULT_TERMINAL_LINE_HEIGHT,
          state.isDarkMode,
          state.setLayout,
          state.activeTaskId,
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId],
        ] as const,
    ),
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionBufferRef = useRef<Record<string, string>>({});
  const pendingInputBySessionRef = useRef<Record<string, string>>({});
  const writeInFlightBySessionRef = useRef<Record<string, boolean>>({});
  const transcriptRef = useRef<Record<string, string>>({});
  const creatingSessionRef = useRef(false);
  const transcriptFlushTimerRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number }>({
    cols: 0,
    rows: 0,
  });
  const transcriptLoadedRef = useRef(false);
  const workspaceTerminalStateRef = useRef<
    Record<string, WorkspaceTerminalState>
  >({});
  const prevWorkspaceCwdRef = useRef<string | undefined>(undefined);

  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState("");
  const [terminalReady, setTerminalReady] = useState(false);

  const activeSessionId = activeTabId;
  const taskKey = `${activeWorkspaceId}:${activeTaskId || "no-task"}`;
  const taskKeyRef = useRef(taskKey);
  const supportsPushTerminalOutput =
    typeof window !== "undefined" &&
    Boolean(
      window.api?.terminal?.subscribeSessionOutput &&
        window.api?.terminal?.setSessionDeliveryMode,
    );

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

    sessionBufferRef.current[args.sessionId] = appendTerminalText(
      sessionBufferRef.current[args.sessionId] ?? "",
      args.output,
      TERMINAL_SESSION_BUFFER_CHAR_LIMIT,
    );
    transcriptRef.current[taskKeyRef.current] = appendTerminalText(
      transcriptRef.current[taskKeyRef.current] ?? "",
      args.output,
      TERMINAL_TRANSCRIPT_CHAR_LIMIT,
    );

    if (activeSessionIdRef.current === args.sessionId) {
      xtermRef.current?.write(args.output);
    }

    scheduleTranscriptFlush();
  }

  async function syncTerminalOutput(args: { sessionIds: string[] }) {
    const readSession = window.api?.terminal?.readSession;
    if (!readSession || args.sessionIds.length === 0) {
      return;
    }

    const reads = await Promise.all(
      args.sessionIds.map(
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

  async function updateSessionDeliveryModes(args: {
    sessionIds: string[];
    deliveryMode: "poll" | "push";
  }) {
    const setSessionDeliveryMode = window.api?.terminal?.setSessionDeliveryMode;
    if (!setSessionDeliveryMode || args.sessionIds.length === 0) {
      return;
    }

    await Promise.allSettled(
      args.sessionIds.map((sessionId) =>
        setSessionDeliveryMode({
          sessionId,
          deliveryMode: args.deliveryMode,
        }),
      ),
    );
  }

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    taskKeyRef.current = taskKey;
  }, [taskKey]);

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
    terminal.loadAddon(fitAddon);
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

    // ResizeObserver fires after layout is complete and fonts are applied,
    // so it handles both the initial fit and all subsequent size changes.
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
      if (
        !Object.prototype.hasOwnProperty.call(
          sessionBufferRef.current,
          sessionId,
        )
      ) {
        return;
      }

      applyTerminalOutput({ sessionId, output });
    });
  }, [supportsPushTerminalOutput, taskKey]);

  async function createSessionTab() {
    if (creatingSessionRef.current) return;
    creatingSessionRef.current = true;
    try {
      const createSession = window.api?.terminal?.createSession;
      if (!createSession) {
        const message = "Terminal bridge unavailable. Use bun run dev:desktop.";
        setBridgeError(message);
        xtermRef.current?.writeln(`\r\n[error] ${message}`);
        return;
      }
      const cols = xtermRef.current?.cols ?? 80;
      const rows = xtermRef.current?.rows ?? 24;
      const created = await createSession({
        cwd: workspaceCwd,
        cols,
        rows,
        deliveryMode: supportsPushTerminalOutput ? "push" : "poll",
      });
      if (!created.ok || !created.sessionId) {
        setBridgeError("Failed to create terminal session.");
        xtermRef.current?.writeln(
          "\r\n[error] failed to create terminal session.",
        );
        return;
      }
      setBridgeError("");
      const nextId = created.sessionId;
      sessionBufferRef.current[nextId] = "";
      pendingInputBySessionRef.current[nextId] = "";
      writeInFlightBySessionRef.current[nextId] = false;
      setTabs((prev) => {
        const index = prev.length + 1;
        return [...prev, { id: nextId, label: `Terminal ${index}` }];
      });
      setActiveTabId(nextId);
    } finally {
      creatingSessionRef.current = false;
    }
  }

  async function closeSession(args: { sessionId: string }) {
    const closeSessionApi = window.api?.terminal?.closeSession;
    if (closeSessionApi) {
      await closeSessionApi({ sessionId: args.sessionId });
    }
    delete sessionBufferRef.current[args.sessionId];
    delete pendingInputBySessionRef.current[args.sessionId];
    delete writeInFlightBySessionRef.current[args.sessionId];
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== args.sessionId);
      setActiveTabId((current) =>
        current === args.sessionId ? (next.at(-1)?.id ?? null) : current,
      );
      return next;
    });
  }

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }
    xtermRef.current.clear();
    const transcript = transcriptRef.current[taskKey];
    if (transcript) {
      xtermRef.current.write(transcript);
    }
  }, [taskKey]);

  // Persist terminal sessions across workspace switches instead of killing them.
  useEffect(() => {
    if (!terminalReady) {
      return;
    }

    const prevCwd = prevWorkspaceCwdRef.current;
    prevWorkspaceCwdRef.current = workspaceCwd;

    // Save previous workspace's terminal state before switching.
    if (prevCwd && prevCwd !== workspaceCwd) {
      workspaceTerminalStateRef.current[prevCwd] = {
        tabs: tabs,
        activeTabId: activeTabId,
        sessionBuffers: { ...sessionBufferRef.current },
      };
      if (supportsPushTerminalOutput) {
        void updateSessionDeliveryModes({
          sessionIds: tabs.map((tab) => tab.id),
          deliveryMode: "poll",
        });
      }
    }

    // Restore saved state or start fresh for the new workspace.
    const saved = workspaceCwd
      ? workspaceTerminalStateRef.current[workspaceCwd]
      : undefined;
    if (saved && saved.tabs.length > 0) {
      setTabs(saved.tabs);
      setActiveTabId(saved.activeTabId);
      sessionBufferRef.current = saved.sessionBuffers;
      xtermRef.current?.clear();
      const buffer = saved.activeTabId
        ? (saved.sessionBuffers[saved.activeTabId] ?? "")
        : "";
      if (buffer.trim()) {
        xtermRef.current?.write(buffer);
      }
      if (supportsPushTerminalOutput) {
        const sessionIds = saved.tabs.map((tab) => tab.id);
        void updateSessionDeliveryModes({
          sessionIds,
          deliveryMode: "push",
        }).then(() => syncTerminalOutput({ sessionIds }));
      }
    } else {
      setTabs([]);
      setActiveTabId(null);
      sessionBufferRef.current = {};
      xtermRef.current?.clear();
      void createSessionTab();
    }

    // Only kill sessions on full unmount (component teardown), not workspace switch.
    return () => {
      // Save current workspace state on unmount so it's available next mount.
      if (workspaceCwd) {
        workspaceTerminalStateRef.current[workspaceCwd] = {
          tabs,
          activeTabId,
          sessionBuffers: { ...sessionBufferRef.current },
        };
      }
      if (supportsPushTerminalOutput) {
        void updateSessionDeliveryModes({
          sessionIds: tabs.map((tab) => tab.id),
          deliveryMode: "poll",
        });
      }
    };
  }, [supportsPushTerminalOutput, workspaceCwd, terminalReady]);

  // Fallback: ensure a session exists when a task is active but all sessions were cleared.
  useEffect(() => {
    if (!terminalReady || !activeTaskId || tabs.length > 0) return;
    void createSessionTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, tabs.length, terminalReady]);

  useEffect(() => {
    if (supportsPushTerminalOutput) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      const ids = tabs.map((tab) => tab.id);
      if (ids.length === 0) {
        return;
      }
      await syncTerminalOutput({ sessionIds: ids });

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
  }, [supportsPushTerminalOutput, tabs, taskKey]);

  useEffect(() => {
    if (!activeSessionId || !xtermRef.current) {
      return;
    }

    xtermRef.current.clear();
    const buffer = sessionBufferRef.current[activeSessionId] ?? "";
    if (buffer.trim()) {
      xtermRef.current.write(buffer);
    }
  }, [activeSessionId]);

  function clearActiveTerminal() {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }
    sessionBufferRef.current[sessionId] = "";
    transcriptRef.current[taskKey] = "";
    scheduleTranscriptFlush();
    xtermRef.current?.clear();
  }

  return (
    <div
      data-testid="terminal-dock"
      className="transition-[height] duration-200"
      style={{ height: `${terminalDockHeight}px` }}
    >
      <div className="grid h-full min-h-0 grid-cols-[1fr_156px] gap-1 overflow-hidden bg-card">
        <section className="min-h-0 overflow-hidden">
          <div className="flex h-9 items-center justify-between border-b border-border/80 px-3 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-foreground">
              <SquareTerminal className="size-4 text-muted-foreground" />
              Terminal
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                onClick={clearActiveTerminal}
                title="Clear Terminal"
                aria-label="clear-terminal"
              >
                <Eraser className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                onClick={() => setLayout({ patch: { terminalDocked: false } })}
                title="Close Terminal"
                aria-label="close-terminal"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="h-[calc(100%-1.75rem)] overflow-hidden bg-terminal">
            <div ref={containerRef} className="h-full w-full" />
          </div>
        </section>

        <aside className="min-h-0 border-l border-border/80 bg-muted/30">
          <div className="flex h-9 items-center justify-between border-b border-border/80 px-2.5 text-sm">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              Sessions
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                    onClick={() => void createSessionTab()}
                    aria-label="new-terminal-session"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New session</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="max-h-[calc(100%-2.25rem)] space-y-0.5 overflow-auto p-1">
            {bridgeError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {bridgeError}
              </p>
            ) : null}
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  activeTabId === tab.id
                    ? "bg-secondary/80 text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="truncate">{tab.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive",
                    activeTabId === tab.id
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeSession({ sessionId: tab.id });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      void closeSession({ sessionId: tab.id });
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
