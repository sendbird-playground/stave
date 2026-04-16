import { useEffect, useRef } from "react";
import {
  TERMINAL_SURFACE_CLASS_NAME,
  TERMINAL_SURFACE_FRAME_CLASS_NAME,
} from "@/components/layout/terminal-surface-styles";
import { useTerminalInstance } from "@/components/layout/useTerminalInstance";
import type { UseTerminalTabManagerReturn } from "@/components/layout/useTerminalTabManager";
import { getTerminalSessionRouter } from "@/lib/terminal/terminal-session-router";
import { cn } from "@/lib/utils";

const INACTIVE_OUTPUT_BUFFER_MAX_CHARS = 512_000;

function appendBoundedText(existing: string, next: string, maxChars: number) {
  if (!next) {
    return existing;
  }
  const combined = `${existing}${next}`;
  if (combined.length <= maxChars) {
    return combined;
  }
  return combined.slice(-maxChars);
}

export function TerminalTabSurface(args: {
  tabKey: string;
  sessionId: string | null;
  surface: "terminal-dock" | "cli-session";
  isActive: boolean;
  isVisible: boolean;
  fontFamily: string;
  fontSize: number;
  isDarkMode: boolean;
  dimmed?: boolean;
  tabManager: UseTerminalTabManagerReturn;
  onData: (tabKey: string, input: string) => void;
  onResize: (
    tabKey: string,
    cols: number,
    rows: number,
  ) => Promise<void> | void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isActiveRef = useRef(args.isActive);
  const deferredScreenStateRef = useRef<string | null>(null);
  const deferredOutputRef = useRef("");

  useEffect(() => {
    isActiveRef.current = args.isActive;
  }, [args.isActive]);

  useEffect(() => {
    deferredScreenStateRef.current = null;
    deferredOutputRef.current = "";
  }, [args.sessionId]);

  const terminalInstance = useTerminalInstance({
    containerRef,
    diagnosticContext: {
      surface: args.surface,
      tabKey: args.tabKey,
      sessionId: args.sessionId,
    },
    enabled: args.tabManager.shouldMountTerminal(args.tabKey),
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    isDarkMode: args.isDarkMode,
    visible: args.isVisible && args.isActive,
    restartToken: args.tabManager.getRestartToken(args.tabKey),
    onData: (input) => args.onData(args.tabKey, input),
    onResize: (cols, rows) => args.onResize(args.tabKey, cols, rows),
  });

  useEffect(() => (
    args.tabManager.registerInstance(args.tabKey, terminalInstance.controller)
  ), [args.tabKey, args.tabManager, terminalInstance.controller]);

  useEffect(() => {
    if (!args.isActive || !terminalInstance.ready) {
      return;
    }

    if (deferredScreenStateRef.current !== null) {
      terminalInstance.controller.clear();
      if (deferredScreenStateRef.current) {
        terminalInstance.controller.write(deferredScreenStateRef.current);
      }
      deferredScreenStateRef.current = null;
    }

    if (deferredOutputRef.current) {
      terminalInstance.controller.write(deferredOutputRef.current);
      deferredOutputRef.current = "";
    }
  }, [args.isActive, terminalInstance.controller, terminalInstance.ready]);

  // Keep the subscription alive for all mounted terminals regardless of which
  // tab is currently active.  Gating on isActive would tear down and recreate
  // the subscription on every tab switch, causing the router to replay the
  // stale attach-time screen state (onScreenState clear) on top of output that
  // was already written to the terminal while it was the active tab — the root
  // cause of text from different sessions appearing mixed together.
  useEffect(() => {
    if (
      !args.sessionId ||
      !args.isVisible ||
      !terminalInstance.ready
    ) {
      return;
    }

    const router = getTerminalSessionRouter();
    return router.subscribe(args.sessionId, {
      onScreenState: (screenState) => {
        if (!isActiveRef.current) {
          deferredScreenStateRef.current = screenState;
          deferredOutputRef.current = "";
          return;
        }
        terminalInstance.controller.clear();
        if (screenState) {
          terminalInstance.controller.write(screenState);
        }
      },
      onOutput: (output) => {
        if (!isActiveRef.current) {
          deferredOutputRef.current = appendBoundedText(
            deferredOutputRef.current,
            output,
            INACTIVE_OUTPUT_BUFFER_MAX_CHARS,
          );
          return;
        }
        terminalInstance.controller.write(output);
      },
    });
  }, [
    args.isVisible,
    args.sessionId,
    terminalInstance.controller,
    terminalInstance.ready,
  ]);

  useEffect(() => {
    args.tabManager.updateInstanceStatus(args.tabKey, {
      ready: terminalInstance.ready,
      error: terminalInstance.error,
      writeErrorCount: terminalInstance.writeErrorCount,
      revision: terminalInstance.revision,
    });
  }, [
    args.tabKey,
    args.tabManager,
    terminalInstance.error,
    terminalInstance.ready,
    terminalInstance.revision,
    terminalInstance.writeErrorCount,
  ]);

  return (
    <div
      className={TERMINAL_SURFACE_FRAME_CLASS_NAME}
      style={{ display: args.isActive ? "block" : "none" }}
      aria-hidden={!args.isActive}
    >
      <div
        ref={containerRef}
        data-terminal-surface
        className={cn(TERMINAL_SURFACE_CLASS_NAME, args.dimmed && "opacity-60")}
      />
    </div>
  );
}
