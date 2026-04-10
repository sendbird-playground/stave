import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { FitAddon, Terminal, init as initGhosttyWasm } from "ghostty-web";

const AUTO_FOCUS_MAX_ATTEMPTS = 60;

export const TERMINAL_WRITE_ERROR_THRESHOLD = 5;

type FocusableTarget = {
  focus?: (this: unknown, options?: { preventScroll?: boolean }) => void;
};

type FocusDocument = {
  activeElement?: unknown;
};

type QueryableContainer = FocusableTarget & {
  querySelector?: (selector: string) => unknown;
  contains?: (target: any) => boolean;
  ownerDocument?: FocusDocument | null;
};

function resolveActiveElement(args: {
  container?: QueryableContainer | null;
  getActiveElement?: (() => unknown) | undefined;
}) {
  if (typeof args.getActiveElement === "function") {
    return args.getActiveElement();
  }
  if (args.container?.ownerDocument) {
    return args.container.ownerDocument.activeElement;
  }
  if (typeof document !== "undefined") {
    return document.activeElement;
  }
  return undefined;
}

function isFocusInsideContainer(args: {
  container?: QueryableContainer | null;
  activeElement: unknown;
}) {
  if (!args.container || !args.activeElement) {
    return false;
  }
  if (typeof args.container.contains === "function") {
    return args.container.contains(args.activeElement);
  }
  return args.activeElement === args.container;
}

function focusAndVerify(args: {
  target: FocusableTarget;
  focusOptions?: { preventScroll?: boolean };
  container?: QueryableContainer | null;
  getActiveElement?: (() => unknown) | undefined;
}) {
  args.target.focus?.call(args.target, args.focusOptions);

  const activeElement = resolveActiveElement({
    container: args.container,
    getActiveElement: args.getActiveElement,
  });

  if (activeElement === undefined) {
    return true;
  }

  return activeElement === args.target || isFocusInsideContainer({
    container: args.container,
    activeElement,
  });
}

export function focusTerminalInstanceSurface(args: {
  terminal?: FocusableTarget | null;
  container?: QueryableContainer | null;
  getActiveElement?: () => unknown;
}) {
  if (
    args.terminal
    && typeof args.terminal.focus === "function"
  ) {
    if (focusAndVerify({
      target: args.terminal,
      container: args.container,
      getActiveElement: args.getActiveElement,
    })) {
      return true;
    }
  }

  const textarea = args.container?.querySelector?.("textarea");
  if (
    textarea
    && typeof (textarea as FocusableTarget | null | undefined)?.focus === "function"
  ) {
    if (focusAndVerify({
      target: textarea as FocusableTarget,
      focusOptions: { preventScroll: true },
      container: args.container,
      getActiveElement: args.getActiveElement,
    })) {
      return true;
    }
  }

  if (
    args.container
    && typeof args.container.focus === "function"
  ) {
    if (focusAndVerify({
      target: args.container,
      focusOptions: { preventScroll: true },
      container: args.container,
      getActiveElement: args.getActiveElement,
    })) {
      return true;
    }
  }

  return false;
}

export function isSwallowableTerminalRuntimeError(error: unknown) {
  return error instanceof Error && /memory access out of bounds/i.test(error.message);
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

let ghosttyWasmReady: Promise<void> | null = null;

function ensureGhosttyWasm() {
  if (!ghosttyWasmReady) {
    ghosttyWasmReady = initGhosttyWasm();
  }
  return ghosttyWasmReady;
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

function writePreservingScroll(args: {
  terminal: Terminal;
  data: string;
  appendNewline?: boolean;
}) {
  const viewportY =
    typeof args.terminal.getViewportY === "function"
      ? args.terminal.getViewportY()
      : 0;

  if (args.appendNewline) {
    args.terminal.writeln(args.data);
  } else {
    args.terminal.write(args.data);
  }

  if (viewportY > 0) {
    args.terminal.scrollToLine(viewportY);
  }
}

function describeTerminalError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

export interface TerminalInstanceController {
  readonly terminal: Terminal | null;
  readonly fitAddon: FitAddon | null;
  clear: () => void;
  write: (data: string) => void;
  writeln: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  focus: () => (() => void);
  proposeDimensions: () => { cols: number; rows: number } | undefined;
  getSize: () => { cols: number; rows: number };
}

export interface UseTerminalInstanceArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  fontFamily: string;
  fontSize: number;
  isDarkMode: boolean;
  visible: boolean;
  restartToken?: number;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export interface UseTerminalInstanceReturn {
  controller: TerminalInstanceController;
  ready: boolean;
  error: string | null;
  writeErrorCount: number;
  revision: number;
}

export function useTerminalInstance(args: UseTerminalInstanceArgs): UseTerminalInstanceReturn {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const themeSyncFrameRef = useRef<number | null>(null);
  const themeKeyRef = useRef<string | null>(null);
  const isComposingRef = useRef(false);
  const visibleRef = useRef(args.visible);
  const onDataRef = useRef(args.onData);
  const onResizeRef = useRef(args.onResize);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeErrorCount, setWriteErrorCount] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    visibleRef.current = args.visible;
  }, [args.visible]);

  useEffect(() => {
    onDataRef.current = args.onData;
    onResizeRef.current = args.onResize;
  }, [args.onData, args.onResize]);

  const clearPendingThemeWork = useCallback(() => {
    if (themeSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(themeSyncFrameRef.current);
      themeSyncFrameRef.current = null;
    }
  }, []);

  const disposeInstance = useCallback(() => {
    clearPendingThemeWork();

    try {
      cleanupRef.current();
    } catch (caughtError) {
      if (!isSwallowableTerminalRuntimeError(caughtError)) {
        console.warn("[terminal] failed to dispose renderer", caughtError);
      }
    }

    cleanupRef.current = () => {};
    terminalRef.current = null;
    fitAddonRef.current = null;
    themeKeyRef.current = null;
    setReady(false);
  }, [clearPendingThemeWork]);

  const executeTerminalOperation = useCallback(<T,>(
    context: string,
    operation: () => T,
    options: {
      countWriteError?: boolean;
      message?: string;
    } = {},
  ) => {
    try {
      return operation();
    } catch (caughtError) {
      if (options.countWriteError) {
        setWriteErrorCount((count) => count + 1);
      }

      if (isSwallowableTerminalRuntimeError(caughtError)) {
        console.warn(`[terminal] ${context} (swallowed)`, caughtError);
        return undefined;
      }

      console.error(`[terminal] ${context}`, caughtError);
      setError(describeTerminalError(caughtError, options.message ?? "Terminal renderer failed."));
      return undefined;
    }
  }, []);

  const measureProposedDimensions = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const container = args.containerRef.current;
    if (!fitAddon || !container) {
      return undefined;
    }
    if (container.offsetWidth <= 0 || container.offsetHeight <= 0) {
      return undefined;
    }

    const proposed = executeTerminalOperation(
      "measure-terminal-dimensions",
      () => fitAddon.proposeDimensions(),
      { message: "Failed to measure terminal dimensions." },
    );
    if (!proposed) {
      return undefined;
    }

    return {
      cols: Math.max(1, proposed.cols),
      rows: Math.max(1, proposed.rows),
    };
  }, [args.containerRef, executeTerminalOperation]);

  const emitResize = useCallback(() => {
    if (!visibleRef.current) {
      return;
    }
    const proposed = measureProposedDimensions();
    if (!proposed) {
      return;
    }
    onResizeRef.current(proposed.cols, proposed.rows);
  }, [measureProposedDimensions]);

  const syncTerminalTheme = useCallback((force = false) => {
    const terminal = terminalRef.current;
    if (!terminal || typeof document === "undefined") {
      return;
    }

    const theme = resolveTerminalTheme();
    const themeKey = getResolvedTerminalThemeKey(theme);
    if (!force && themeKeyRef.current === themeKey) {
      return;
    }

    themeKeyRef.current = themeKey;
    executeTerminalOperation("sync-terminal-theme", () => {
      applyTerminalTheme({ terminal, theme });
    }, { message: "Failed to apply terminal theme." });
  }, [executeTerminalOperation]);

  const scheduleTerminalThemeSync = useCallback((force = false) => {
    if (themeSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(themeSyncFrameRef.current);
    }

    themeSyncFrameRef.current = window.requestAnimationFrame(() => {
      themeSyncFrameRef.current = null;
      syncTerminalTheme(force);
    });
  }, [syncTerminalTheme]);

  const focus = useCallback(() => {
    let cancelled = false;
    let attempts = 0;

    const tryFocus = () => {
      if (cancelled) {
        return;
      }

      const didFocus = focusTerminalInstanceSurface({
        terminal: terminalRef.current,
        container: args.containerRef.current,
      });
      if (didFocus) {
        return;
      }

      attempts += 1;
      if (attempts < AUTO_FOCUS_MAX_ATTEMPTS) {
        window.requestAnimationFrame(tryFocus);
      }
    };

    window.requestAnimationFrame(tryFocus);

    return () => {
      cancelled = true;
    };
  }, [args.containerRef]);

  useEffect(() => {
    if (!args.enabled) {
      disposeInstance();
      setError(null);
      setWriteErrorCount(0);
      return;
    }

    let cancelled = false;

    setReady(false);
    setError(null);
    setWriteErrorCount(0);

    const bootstrap = async () => {
      try {
        await ensureGhosttyWasm();
      } catch (caughtError) {
        if (!cancelled) {
          setError(describeTerminalError(caughtError, "Failed to load terminal renderer."));
        }
        return;
      }

      const container = args.containerRef.current;
      if (cancelled || !container) {
        return;
      }

      if (typeof document !== "undefined" && "fonts" in document) {
        const fontSpec = `${args.fontSize}px ${args.fontFamily}`;
        try {
          await Promise.race([
            document.fonts.load(fontSpec),
            new Promise<void>((resolve) => setTimeout(resolve, 1500)),
          ]);
        } catch {
          // Best-effort font preload. Continue even if the browser rejects it.
        }
      }

      if (cancelled) {
        return;
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

      try {
        terminal.loadAddon(fitAddon);
        terminal.open(container);
      } catch (caughtError) {
        try {
          terminal.dispose();
        } catch {
          // Ignore best-effort cleanup after failed bootstrap.
        }
        if (!cancelled) {
          setError(describeTerminalError(caughtError, "Failed to initialize terminal renderer."));
        }
        return;
      }

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      themeKeyRef.current = null;

      const resizeObserver = typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (!visibleRef.current || isComposingRef.current) {
              return;
            }
            emitResize();
          })
        : null;
      resizeObserver?.observe(container);

      const dataDisposable = terminal.onData((input) => {
        onDataRef.current(input);
      });

      const onFocusIn = () => {
        terminal.options.cursorBlink = true;
      };
      const onFocusOut = (event: FocusEvent) => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && container.contains(relatedTarget)) {
          return;
        }
        terminal.options.cursorBlink = false;
      };
      const onCompositionStart = () => {
        isComposingRef.current = true;
      };
      const onCompositionEnd = () => {
        isComposingRef.current = false;
        emitResize();
      };

      container.addEventListener("focusin", onFocusIn);
      container.addEventListener("focusout", onFocusOut);
      container.addEventListener("compositionstart", onCompositionStart);
      container.addEventListener("compositionend", onCompositionEnd);

      await waitForAnimationFrames(2);
      if (cancelled) {
        dataDisposable.dispose();
        resizeObserver?.disconnect();
        terminal.dispose();
        return;
      }

      const proposed = measureProposedDimensions();
      if (proposed) {
        executeTerminalOperation("resize-terminal-on-bootstrap", () => {
          terminal.resize(proposed.cols, proposed.rows);
        }, { message: "Failed to size terminal renderer." });
        onResizeRef.current(proposed.cols, proposed.rows);
      }

      scheduleTerminalThemeSync(true);

      if (!cancelled) {
        setReady(true);
        setRevision((value) => value + 1);
      }

      cleanupRef.current = () => {
        container.removeEventListener("focusin", onFocusIn);
        container.removeEventListener("focusout", onFocusOut);
        container.removeEventListener("compositionstart", onCompositionStart);
        container.removeEventListener("compositionend", onCompositionEnd);
        dataDisposable.dispose();
        resizeObserver?.disconnect();
        terminal.dispose();
      };
    };

    void bootstrap();

    return () => {
      cancelled = true;
      disposeInstance();
    };
  }, [
    args.containerRef,
    args.enabled,
    args.fontFamily,
    args.fontSize,
    args.restartToken,
    disposeInstance,
    emitResize,
    executeTerminalOperation,
    measureProposedDimensions,
    scheduleTerminalThemeSync,
  ]);

  useEffect(() => {
    if (!args.enabled || typeof MutationObserver === "undefined" || typeof document === "undefined") {
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
        scheduleTerminalThemeSync(true);
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
  }, [args.enabled, scheduleTerminalThemeSync]);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    scheduleTerminalThemeSync(true);
  }, [args.enabled, args.isDarkMode, scheduleTerminalThemeSync]);

  useEffect(() => {
    if (!args.enabled || !args.visible || !ready) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await waitForAnimationFrames(2);
      if (cancelled) {
        return;
      }
      emitResize();
    })();

    return () => {
      cancelled = true;
    };
  }, [args.enabled, args.visible, emitResize, ready]);

  useEffect(() => {
    if (args.visible) {
      return;
    }
    terminalRef.current?.options && (terminalRef.current.options.cursorBlink = false);
  }, [args.visible]);

  const controller = useMemo<TerminalInstanceController>(() => ({
    get terminal() {
      return terminalRef.current;
    },
    get fitAddon() {
      return fitAddonRef.current;
    },
    clear() {
      executeTerminalOperation("clear-terminal", () => {
        terminalRef.current?.clear();
      }, { message: "Failed to clear terminal renderer." });
    },
    write(data: string) {
      if (!data) {
        return;
      }
      executeTerminalOperation("write-terminal-output", () => {
        if (!terminalRef.current) {
          return;
        }
        writePreservingScroll({
          terminal: terminalRef.current,
          data,
        });
      }, {
        countWriteError: true,
        message: "Failed to render terminal output.",
      });
    },
    writeln(data: string) {
      executeTerminalOperation("write-terminal-line", () => {
        if (!terminalRef.current) {
          return;
        }
        writePreservingScroll({
          terminal: terminalRef.current,
          data,
          appendNewline: true,
        });
      }, {
        countWriteError: true,
        message: "Failed to render terminal output.",
      });
    },
    resize(cols: number, rows: number) {
      executeTerminalOperation("resize-terminal", () => {
        terminalRef.current?.resize(cols, rows);
      }, { message: "Failed to resize terminal renderer." });
    },
    focus,
    proposeDimensions() {
      return measureProposedDimensions();
    },
    getSize() {
      return {
        cols: terminalRef.current?.cols ?? 0,
        rows: terminalRef.current?.rows ?? 0,
      };
    },
  }), [executeTerminalOperation, focus, measureProposedDimensions]);

  return {
    controller,
    ready,
    error,
    writeErrorCount,
    revision,
  };
}
