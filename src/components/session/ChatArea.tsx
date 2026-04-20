import { FolderOpen, Layers, Swords } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ChatInput } from "@/components/session/ChatInput";
import { ChatPanel } from "@/components/session/ChatPanel";
import { ColiseumArenaPanel } from "@/components/session/ColiseumArenaPanel";
import { ColiseumLauncherDialog } from "@/components/session/ColiseumLauncherDialog";
import {
  resolveChatAreaViewMode,
  resolveHydratingProjectCopy,
} from "@/components/session/chat-area.utils";
import { EmptySplash } from "@/components/session/EmptySplash";
import { PlanViewer } from "@/components/session/PlanViewer";
import { TodoFloater } from "@/components/session/TodoFloater";
import { SessionLoadingState } from "@/components/session/SessionLoadingState";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { isTaskArchived, isTaskManaged } from "@/lib/tasks";
import { RenderProfiler } from "@/lib/render-profiler";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: readonly unknown[] = [];

export const ChatArea = memo(ChatAreaImpl);

function ChatAreaImpl() {
  const chatInputDockRef = useRef<HTMLDivElement | null>(null);
  const [chatInputDockHeight, setChatInputDockHeight] = useState(0);
  const sessionAreaRef = useRef<HTMLDivElement>(null);
  const [
    projectPath,
    hasHydratedWorkspaces,
    hasAnyWorkspace,
    hasSelectedWorkspace,
    hasSelectedTask,
    activeTaskId,
    activeTaskMessageCount,
    activeTask,
    activeTurnId,
    activeColiseum,
    persistenceBootstrapPhase,
    persistenceBootstrapMessage,
    refreshActiveManagedTask,
    createProject,
    createTask,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.hasHydratedWorkspaces,
          state.workspaces.length > 0,
          state.workspaces.some(
            (workspace) => workspace.id === state.activeWorkspaceId,
          ),
          state.tasks.some(
            (task) => task.id === state.activeTaskId && !isTaskArchived(task),
          ),
          state.activeTaskId,
          state.messageCountByTask[state.activeTaskId] ??
            (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).length,
          state.tasks.find(
            (task) => task.id === state.activeTaskId && !isTaskArchived(task),
          ) ?? null,
          state.activeTurnIdsByTask[state.activeTaskId],
          state.activeColiseumsByTask[state.activeTaskId] ?? null,
          state.persistenceBootstrapPhase,
          state.persistenceBootstrapMessage,
          state.refreshActiveManagedTask,
          state.createProject,
          state.createTask,
        ] as const,
    ),
  );
  const viewMode = resolveChatAreaViewMode({
    projectPath,
    hasHydratedWorkspaces,
    hasAnyWorkspace,
    hasSelectedWorkspace,
    hasSelectedTask,
    activeTaskMessageCount,
  });
  const hydratingProjectCopy = resolveHydratingProjectCopy({
    persistenceBootstrapPhase,
    persistenceBootstrapMessage,
  });
  const isEmpty = activeTaskMessageCount === 0;
  const shouldPollManagedTask =
    isTaskManaged(activeTask) && Boolean(activeTurnId);

  useEffect(() => {
    if (!shouldPollManagedTask) {
      return;
    }
    void refreshActiveManagedTask();
    const handle = window.setInterval(() => {
      void refreshActiveManagedTask();
    }, 3000);
    return () => window.clearInterval(handle);
  }, [refreshActiveManagedTask, shouldPollManagedTask]);

  useLayoutEffect(() => {
    if (isEmpty) {
      setChatInputDockHeight(0);
      return;
    }

    const node = chatInputDockRef.current;
    if (!node) {
      return;
    }

    const syncHeight = () => {
      const nextHeight = node.offsetHeight;
      setChatInputDockHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    syncHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(node);

    return () => observer.disconnect();
  }, [isEmpty]);

  const handleSessionAreaMouseDownCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], [role='link'], [role='textbox'], [contenteditable='true']",
        )
      ) {
        return;
      }

      sessionAreaRef.current?.focus({ preventScroll: true });
    },
    [],
  );

  const sessionAreaProps = {
    ref: sessionAreaRef,
    tabIndex: -1,
    "data-testid": "session-area",
    "data-task-abort-scope": "",
    onMouseDownCapture: handleSessionAreaMouseDownCapture,
    className:
      "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background outline-none",
  } as const;

  if (viewMode === "no_project") {
    return (
      <div {...sessionAreaProps}>
        <Empty data-testid="splash-no-project">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Open a Project</EmptyTitle>
            <EmptyDescription>
              Select a local repository folder to get started.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void createProject({})}>
              <FolderOpen className="size-4" />
              Select Folder
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (viewMode === "hydrating_project") {
    return (
      <div {...sessionAreaProps}>
        <SessionLoadingState
          testId="session-loading-state"
          title={hydratingProjectCopy.title}
          description={hydratingProjectCopy.description}
        />
      </div>
    );
  }

  if (viewMode === "no_workspace") {
    return (
      <div {...sessionAreaProps}>
        <Empty data-testid="splash-no-workspace">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Pick a Workspace</EmptyTitle>
            <EmptyDescription>
              Select a workspace from the left sidebar to continue.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (viewMode === "no_task") {
    return (
      <div {...sessionAreaProps}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
            <EmptySplash
              layout="top-card"
              onCreateTask={() => createTask({ title: "" })}
              showCreateTaskAction
              showCreateCliSessionAction
            />
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "empty_task") {
    // The Coliseum launcher is intentionally shown even on a brand-new task —
    // picking a model with Coliseum is itself a way to start the task, so
    // hiding the button until after the first turn sent it to a dead end.
    const canStartColiseum = activeTask != null && !activeTurnId;
    return (
      <div {...sessionAreaProps}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-6xl flex-col">
              <EmptySplash
                layout="top-card"
                title="Start this task"
                description="Send the first prompt to begin work in this workspace — or use the Coliseum below to compare answers from multiple models in parallel."
              />
            </div>
          </div>
          <div ref={chatInputDockRef} className="relative z-30 shrink-0">
            {activeTask ? (
              <ColiseumLauncherStrip
                parentTaskId={activeTaskId}
                defaultProviderId={activeTask.provider}
                canStartColiseum={canStartColiseum}
                hint="Try Coliseum to run your first prompt against multiple models at once."
              />
            ) : null}
            <RenderProfiler id="ChatInput" thresholdMs={8}>
              <ChatInput />
            </RenderProfiler>
          </div>
        </div>
      </div>
    );
  }

  // When the active task has a live Coliseum group that is *not* minimized,
  // switch the whole session area to the arena layout. A minimized arena
  // keeps its state but falls back to the chat view with a restore pill.
  if (activeColiseum && !activeColiseum.minimized) {
    return (
      <div {...sessionAreaProps}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <RenderProfiler id="ColiseumArenaPanel" thresholdMs={8}>
            <ColiseumArenaPanel parentTaskId={activeTaskId} />
          </RenderProfiler>
        </div>
      </div>
    );
  }

  const canStartColiseum = activeTask != null && !activeTurnId;
  const coliseumDisabledReason = activeTurnId
    ? "Wait for the current turn to finish before starting a Coliseum."
    : undefined;

  return (
    <div {...sessionAreaProps}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <RenderProfiler id="ChatPanel" thresholdMs={8}>
          <ChatPanel />
        </RenderProfiler>
        <RenderProfiler id="PlanViewer">
          <PlanViewer inputDockHeight={chatInputDockHeight} />
        </RenderProfiler>
        <TodoFloater inputDockHeight={chatInputDockHeight} />
        <div ref={chatInputDockRef} className="relative z-30 shrink-0">
          {activeColiseum?.minimized ? (
            <ColiseumMinimizedPill parentTaskId={activeTaskId} />
          ) : null}
          {activeTask ? (
            <ColiseumLauncherStrip
              parentTaskId={activeTaskId}
              defaultProviderId={activeTask.provider}
              canStartColiseum={canStartColiseum && !activeColiseum?.minimized}
              disabledReason={
                activeColiseum?.minimized
                  ? "Reopen the paused Coliseum to close or discard it before starting another."
                  : coliseumDisabledReason
              }
            />
          ) : null}
          <RenderProfiler id="ChatInput" thresholdMs={8}>
            <ChatInput />
          </RenderProfiler>
        </div>
      </div>
    </div>
  );
}

interface ColiseumLauncherStripProps {
  parentTaskId: string;
  defaultProviderId: "claude-code" | "codex" | "stave";
  canStartColiseum: boolean;
  disabledReason?: string;
  hint?: string;
}

function ColiseumLauncherStrip(props: ColiseumLauncherStripProps) {
  // Transparent strip — width tracks the `max-w-6xl` content column so the
  // launcher stays visually anchored to the chat (not the far-right viewport
  // edge). No full-width opaque background, so the TodoFloater (which
  // anchors to `right: 16px` above the input dock) can't be covered by a
  // strip bleeding under it. Keeps `z-30` via the parent dock wrapper.
  return (
    <div className="px-3 pt-1.5 pb-0.5">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
        {props.hint ? (
          <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:inline">
            {props.hint}
          </span>
        ) : null}
        <div className="ml-auto flex items-center rounded-full border border-border/60 bg-background/85 p-0.5 shadow-sm supports-backdrop-filter:backdrop-blur-xs">
          <ColiseumLauncherDialog
            parentTaskId={props.parentTaskId}
            defaultProviderId={props.defaultProviderId}
            disabled={!props.canStartColiseum}
            disabledReason={props.disabledReason}
          />
        </div>
      </div>
    </div>
  );
}

function ColiseumMinimizedPill(props: { parentTaskId: string }) {
  const [
    restoreColiseum,
    discardColiseumRun,
    runningCount,
    totalCount,
    championPicked,
  ] = useAppStore(
    useShallow((state) => {
      const group = state.activeColiseumsByTask[props.parentTaskId];
      const running = group
        ? group.branchTaskIds.filter(
            (branchId) => state.activeTurnIdsByTask[branchId],
          ).length
        : 0;
      return [
        state.restoreColiseum,
        state.discardColiseumRun,
        running,
        group?.branchTaskIds.length ?? 0,
        Boolean(group?.championTaskId),
      ] as const;
    }),
  );
  const statusText = championPicked
    ? "Champion picked"
    : runningCount > 0
      ? `${runningCount} of ${totalCount} still running`
      : `${totalCount} branches ready`;
  // Content-width pill, same rationale as ColiseumLauncherStrip: anchor to
  // the `max-w-6xl` column and keep the background confined to the pill so
  // the TodoFloater (`right: 16px`) isn't covered by a full-width strip.
  return (
    <div className="px-3 pt-1.5 pb-0.5 text-xs">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 rounded-full border border-border/60 bg-muted/60 px-3 py-1 shadow-sm supports-backdrop-filter:backdrop-blur-xs">
      <Swords className="size-3.5 text-muted-foreground" />
      <span className="truncate text-foreground">Coliseum paused</span>
      <span className="truncate text-muted-foreground">· {statusText}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {/*
         * When a champion has been promoted, expose a one-click close so the
         * user can immediately start a follow-up Coliseum on the same task
         * without having to reopen the arena first. The champion's answer is
         * already grafted on the parent, so this is lossless.
         */}
        {championPicked ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-sm px-2 text-xs shadow-none"
            onClick={() =>
              discardColiseumRun({ parentTaskId: props.parentTaskId })
            }
            title="Keep the champion's answer and close the arena so you can start a new Coliseum."
          >
            Close & keep champion
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-sm px-2 text-xs shadow-none"
          onClick={() => restoreColiseum({ parentTaskId: props.parentTaskId })}
        >
          Reopen arena
        </Button>
      </div>
      </div>
    </div>
  );
}
