import { FolderOpen, Layers } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { ChatInput } from "@/components/session/ChatInput";
import { ChatPanel } from "@/components/session/ChatPanel";
import { EmptySplash } from "@/components/session/EmptySplash";
import { PlanViewer } from "@/components/session/PlanViewer";
import { TaskAutoApproval } from "@/components/session/TaskAutoApproval";
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui";
import { isTaskManaged } from "@/lib/tasks";
import { RenderProfiler } from "@/lib/render-profiler";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";

export function ChatArea() {
  const chatInputDockRef = useRef<HTMLDivElement | null>(null);
  const [chatInputDockHeight, setChatInputDockHeight] = useState(0);
  const sessionAreaRef = useRef<HTMLDivElement>(null);
  const [
    projectPath,
    hasAnyWorkspace,
    hasSelectedWorkspace,
    hasSelectedTask,
    activeTaskMessageCount,
    activeTask,
    activeTurnId,
    refreshActiveManagedTask,
    createProject,
    createTask,
  ] = useAppStore(useShallow((state) => [
    state.projectPath,
    state.workspaces.length > 0,
    state.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId),
    state.tasks.some((task) => task.id === state.activeTaskId),
    (state.messagesByTask[state.activeTaskId] ?? []).length,
    state.tasks.find((task) => task.id === state.activeTaskId) ?? null,
    state.activeTurnIdsByTask[state.activeTaskId],
    state.refreshActiveManagedTask,
    state.createProject,
    state.createTask,
  ] as const));
  const isEmpty = activeTaskMessageCount === 0;
  const shouldPollManagedTask = isTaskManaged(activeTask) && Boolean(activeTurnId);

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
      setChatInputDockHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
    };

    syncHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(node);

    return () => observer.disconnect();
  }, [isEmpty]);

  const handleSessionAreaMouseDownCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    // Keep Escape scoped to the task surface even when users click a non-focusable
    // message area before pressing the shortcut.
    if (target.closest("button, a, input, textarea, select, [role='button'], [role='link'], [role='textbox'], [contenteditable='true']")) {
      return;
    }

    sessionAreaRef.current?.focus({ preventScroll: true });
  }, []);

  const sessionAreaProps = {
    ref: sessionAreaRef,
    tabIndex: -1,
    "data-testid": "session-area",
    "data-task-abort-scope": "",
    onMouseDownCapture: handleSessionAreaMouseDownCapture,
    className: "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface outline-none",
  } as const;

  if (!projectPath) {
    return (
      <div {...sessionAreaProps}>
        <Empty data-testid="splash-no-project">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Open a Project</EmptyTitle>
            <EmptyDescription>Select a local repository folder to get started.</EmptyDescription>
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

  if (hasAnyWorkspace && !hasSelectedWorkspace) {
    return (
      <div {...sessionAreaProps}>
        <Empty data-testid="splash-no-workspace">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Pick a Workspace</EmptyTitle>
            <EmptyDescription>Select a workspace from the left sidebar to continue.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!hasSelectedTask) {
    return (
      <div {...sessionAreaProps}>
        <EmptySplash onCreateTask={() => createTask({ title: "" })} showCreateTaskAction />
      </div>
    );
  }

  const content = isEmpty
    ? (
        <section className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="w-full max-w-6xl">
            <RenderProfiler id="ChatInputCompact">
              <ChatInput compact />
            </RenderProfiler>
          </div>
        </section>
      )
    : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <RenderProfiler id="ChatPanel" thresholdMs={8}>
            <ChatPanel />
          </RenderProfiler>
          <RenderProfiler id="PlanViewer">
            <PlanViewer inputDockHeight={chatInputDockHeight} />
          </RenderProfiler>
          <div ref={chatInputDockRef} className="relative z-10 shrink-0">
            <RenderProfiler id="ChatInput" thresholdMs={8}>
              <ChatInput />
            </RenderProfiler>
          </div>
        </div>
      );

  return (
    <div {...sessionAreaProps}>
      <TaskAutoApproval />
      {content}
    </div>
  );
}
