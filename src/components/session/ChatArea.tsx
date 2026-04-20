import { FolderOpen, Layers } from "lucide-react";
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
    return (
      <div {...sessionAreaProps}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-6xl flex-col">
              <EmptySplash
                layout="top-card"
                title="Start this task"
                description="Send the first prompt to begin work in this workspace."
              />
            </div>
          </div>
          <div ref={chatInputDockRef} className="relative z-30 shrink-0">
            <RenderProfiler id="ChatInput" thresholdMs={8}>
              <ChatInput />
            </RenderProfiler>
          </div>
        </div>
      </div>
    );
  }

  // When the active task has a live Coliseum group, switch the whole session
  // area to the arena layout: PlanViewer, ChatInput, and the normal ChatPanel
  // are all hidden because branches carry their own ephemeral state and the
  // prompt is already locked in. Once the user promotes a champion (or
  // dismisses), the group clears from `activeColiseumsByTask` and we fall back
  // to the default layout on the next render.
  if (activeColiseum) {
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
          {activeTask ? (
            <div className="flex items-center justify-end border-t border-border/50 bg-background/60 px-3 py-1 supports-backdrop-filter:backdrop-blur-xs">
              <ColiseumLauncherDialog
                parentTaskId={activeTaskId}
                defaultProviderId={activeTask.provider}
                disabled={!canStartColiseum}
                disabledReason={coliseumDisabledReason}
              />
            </div>
          ) : null}
          <RenderProfiler id="ChatInput" thresholdMs={8}>
            <ChatInput />
          </RenderProfiler>
        </div>
      </div>
    </div>
  );
}
