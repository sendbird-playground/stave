import {
  Copy,
  Loader2,
  RefreshCw,
  SquareTerminal,
  ClipboardPaste,
  X,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { TerminalTabSurface } from "@/components/layout/TerminalTabSurface";
import { useTerminalSessionManager } from "@/components/layout/useTerminalSessionManager";
import { useTerminalTabManager } from "@/components/layout/useTerminalTabManager";
import { TERMINAL_WRITE_ERROR_THRESHOLD } from "@/components/layout/useTerminalInstance";
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "@/lib/terminal/defaults";
import {
  buildTerminalSessionSlotKey,
  getCliSessionContextLabel,
  getCliSessionProviderLabel,
  getWorkspaceCliSessionTabKey,
} from "@/lib/terminal/types";
import {
  TERMINAL_SURFACE_PANEL_CLASS_NAME,
  TERMINAL_SURFACE_CLASS_NAME,
  TERMINAL_SURFACE_VIEWPORT_CLASS_NAME,
} from "@/components/layout/terminal-surface-styles";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

const CLI_SESSION_TRANSCRIPT_STORAGE_KEY = "stave:cli-session-transcript:v1";

export function CliSessionPanel() {
  const [
    activeWorkspaceId,
    workspacePath,
    tasks,
    cliSessionTabs,
    activeCliSessionTabId,
    activeSurface,
    closeCliSessionTab,
    settings,
    isDarkMode,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.tasks,
          state.cliSessionTabs,
          state.activeCliSessionTabId,
          state.activeSurface,
          state.closeCliSessionTab,
          state.settings,
          state.isDarkMode,
        ] as const,
    ),
  );

  const activeTab = useMemo(
    () =>
      cliSessionTabs.find((tab) => tab.id === activeCliSessionTabId) ?? null,
    [activeCliSessionTabId, cliSessionTabs],
  );
  const handoffSummary = activeTab?.handoffSummary?.trim() ?? "";
  const getTabKey = useCallback(
    (tab: NonNullable<typeof activeTab>) =>
      getWorkspaceCliSessionTabKey({
        workspaceId: activeWorkspaceId,
        cliSessionTabId: tab.id,
      }),
    [activeWorkspaceId],
  );
  const createSession = useCallback(
    async (args: {
      tab: NonNullable<typeof activeTab>;
      cols: number;
      rows: number;
      deliveryMode: "poll" | "push";
    }) => {
      if (!workspacePath) {
        return { ok: false, stderr: "Workspace path unavailable." };
      }

      const createCliSession = window.api?.terminal?.createCliSession;
      if (!createCliSession) {
        return {
          ok: false,
          stderr: "CLI session bridge unavailable. Use bun run dev:desktop.",
        };
      }

      const currentLinkedTaskTitle = args.tab.linkedTaskId
        ? (tasks.find((task) => task.id === args.tab.linkedTaskId)?.title ??
          args.tab.linkedTaskTitle)
        : args.tab.linkedTaskTitle;

      return createCliSession({
        workspaceId: activeWorkspaceId,
        workspacePath,
        cliSessionTabId: args.tab.id,
        providerId: args.tab.provider,
        contextMode: args.tab.contextMode,
        taskId: args.tab.linkedTaskId,
        taskTitle: currentLinkedTaskTitle,
        cwd: args.tab.cwd,
        cols: args.cols,
        rows: args.rows,
        deliveryMode: args.deliveryMode,
        runtimeOptions:
          args.tab.provider === "claude-code" &&
          settings.claudeBinaryPath.trim()
            ? { claudeBinaryPath: settings.claudeBinaryPath.trim() }
            : args.tab.provider === "codex" && settings.codexBinaryPath.trim()
              ? { codexBinaryPath: settings.codexBinaryPath.trim() }
              : undefined,
      });
    },
    [
      activeWorkspaceId,
      settings.claudeBinaryPath,
      settings.codexBinaryPath,
      tasks,
      workspacePath,
    ],
  );

  const tabManager = useTerminalTabManager({
    tabs: cliSessionTabs,
    activeTabId: activeCliSessionTabId,
    isVisible: activeSurface.kind === "cli-session",
    getTabKey,
  });

  const slotKeyForTab = useCallback(
    (tab: NonNullable<typeof activeTab>) =>
      buildTerminalSessionSlotKey({
        surface: "cli",
        workspaceId: activeWorkspaceId,
        tabId: tab.id,
      }),
    [activeWorkspaceId],
  );

  const {
    activeSessionId,
    activeWriteErrorCount,
    bridgeError,
    getSessionIdForTabKey,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveSession,
    restartActiveTerminalRenderer,
    sessionExited,
    terminalReady,
    writeToActiveSession,
  } = useTerminalSessionManager({
    activeTab,
    activeTabId: activeCliSessionTabId,
    tabs: cliSessionTabs,
    workspaceId: activeWorkspaceId,
    transcriptStorageKey: CLI_SESSION_TRANSCRIPT_STORAGE_KEY,
    isVisible: activeSurface.kind === "cli-session",
    getTabKey,
    createSession,
    slotKeyForTab,
    tabManager,
  });

  async function handleCopyHandoff() {
    if (!handoffSummary) {
      return;
    }
    try {
      await copyTextToClipboard(handoffSummary);
      toast.message("Handoff copied");
    } catch {
      toast.error("Unable to copy handoff");
    }
  }

  function handlePasteHandoff() {
    if (!handoffSummary || !activeSessionId) {
      return;
    }
    const input = handoffSummary.endsWith("\n")
      ? handoffSummary
      : `${handoffSummary}\n`;
    if (!writeToActiveSession(input)) {
      toast.error("CLI session is not ready yet");
      return;
    }
    toast.message("Handoff pasted");
  }

  const hasTabs = cliSessionTabs.length > 0;
  const isVisible = hasTabs && activeSurface.kind === "cli-session";
  const terminalViewport = (
    <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
      <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
        {bridgeError ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {bridgeError}
          </div>
        ) : null}
        {activeWriteErrorCount > TERMINAL_WRITE_ERROR_THRESHOLD ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
            <span>Terminal rendering may be degraded.</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
              onClick={restartActiveTerminalRenderer}
              disabled={!activeTab}
            >
              Restart renderer
            </Button>
          </div>
        ) : null}
        {!terminalReady ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-terminal">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Initializing terminal…</span>
            </div>
          </div>
        ) : null}
        {cliSessionTabs.map((tab) => {
          const tabKey = getTabKey(tab);
          return (
            <TerminalTabSurface
              key={tabKey}
              tabKey={tabKey}
              sessionId={getSessionIdForTabKey(tabKey)}
              surface="cli-session"
              isActive={tab.id === activeCliSessionTabId}
              isVisible={activeSurface.kind === "cli-session"}
              fontFamily={
                settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY
              }
              fontSize={settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE}
              isDarkMode={isDarkMode}
              dimmed={!activeTab}
              tabManager={tabManager}
              onData={handleTerminalInput}
              onResize={handleTerminalResize}
            />
          );
        })}
      </div>
    </div>
  );

  if (!hasTabs) {
    return (
      <section
        data-testid="cli-session-panel"
        className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      />
    );
  }

  // Always render the same React element tree regardless of `isVisible`.
  // Before this fix, invisible renders returned `<section>{terminalViewport}</section>`
  // while visible renders returned `<section><div><header/>{terminalViewport}</div></section>`.
  // The different tree shapes caused React reconciliation to unmount/remount
  // TerminalTabSurface components on every visibility toggle, destroying the
  // ghostty-web Terminal instance and forcing a full transcript re-hydration
  // (~2 MB raw replay) which produced garbled WebGL rendering.
  return (
    <section
      data-testid="cli-session-panel"
      className={cn(
        "h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        isVisible ? "flex" : "hidden",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border/40">
        {/* Header container always at child position 0 so {terminalViewport}
            stays at position 1 and React never unmounts the terminal surface. */}
        <div className="border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur-sm">
          {isVisible ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {activeTab ? (
                    <>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ModelIcon
                          providerId={activeTab.provider}
                          className="size-4 text-muted-foreground"
                        />
                        <span className="truncate">{activeTab.title}</span>
                      </span>
                      <Badge
                        variant="secondary"
                        className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
                      >
                        {getCliSessionProviderLabel(activeTab.provider)}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
                      >
                        {getCliSessionContextLabel(activeTab.contextMode)}
                      </Badge>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                      <SquareTerminal className="size-4 text-muted-foreground" />
                      CLI Session
                    </span>
                  )}
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">
                    {activeTab?.cwd ?? workspacePath ?? "Workspace"}
                  </span>
                  {handoffSummary ? <span>Task handoff ready</span> : null}
                  {sessionExited ? (
                    <span
                      className={cn(
                        "font-medium",
                        sessionExited.exitCode === 0
                          ? "text-muted-foreground"
                          : "text-destructive",
                      )}
                    >
                      exited ({sessionExited.exitCode})
                    </span>
                  ) : activeSessionId ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      live
                    </span>
                  ) : null}
                </div>
              </div>
              <TooltipProvider>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={handleCopyHandoff}
                        disabled={!handoffSummary}
                      >
                        <Copy className="size-3.5" />
                        Copy Handoff
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Copy the task handoff summary
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={handlePasteHandoff}
                        disabled={!handoffSummary || !activeSessionId}
                      >
                        <ClipboardPaste className="size-3.5" />
                        Paste Handoff
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Paste the handoff into the live CLI session
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={() => {
                          restartActiveSession();
                          toast.message("CLI session restarted");
                        }}
                        disabled={!activeTab}
                        aria-label="restart-cli-session"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Restart Session
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={() => {
                          if (activeTab) {
                            closeCliSessionTab({ tabId: activeTab.id });
                          }
                        }}
                        disabled={!activeTab}
                        aria-label="close-cli-session"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Close Session
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          ) : null}
        </div>
        {terminalViewport}
      </div>
    </section>
  );
}
