import { useEffect, useRef } from "react";
import {
  TERMINAL_SURFACE_CLASS_NAME,
  TERMINAL_SURFACE_FRAME_CLASS_NAME,
} from "@/components/layout/terminal-surface-styles";
import { useTerminalInstance } from "@/components/layout/useTerminalInstance";
import type { UseTerminalTabManagerReturn } from "@/components/layout/useTerminalTabManager";
import { cn } from "@/lib/utils";

export function TerminalTabSurface(args: {
  tabKey: string;
  isActive: boolean;
  isVisible: boolean;
  fontFamily: string;
  fontSize: number;
  isDarkMode: boolean;
  dimmed?: boolean;
  tabManager: UseTerminalTabManagerReturn;
  onData: (tabKey: string, input: string) => void;
  onResize: (tabKey: string, cols: number, rows: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalInstance = useTerminalInstance({
    containerRef,
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
