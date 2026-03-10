import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { TopBar } from "@/components/layout/TopBar";
import { WorkspaceBar } from "@/components/layout/WorkspaceBar";
import { TaskList } from "@/components/layout/TaskList";
import { ChatArea } from "@/components/session/ChatArea";
import { TerminalDock } from "@/components/layout/TerminalDock";
import { Toaster } from "@/components/ui";
import { getNextProviderId } from "@/lib/providers/model-catalog";
import { RenderProfiler } from "@/lib/render-profiler";
import { useAppStore } from "@/store/app.store";
import { EditorMainPanel } from "@/components/layout/EditorMainPanel";

const EditorPanel = lazy(() =>
  import("@/components/layout/EditorPanel").then((module) => ({
    default: module.EditorPanel,
  }))
);

type ResizableLayoutKey =
  | "taskListWidth"
  | "editorPanelWidth"
  | "explorerPanelWidth"
  | "terminalDockHeight";

export function AppShell() {
  const [
    projectPath,
    activeTaskId,
    taskListCollapsed,
    taskListWidth,
    editorVisible,
    editorPanelWidth,
    sidebarOverlayVisible,
    explorerPanelWidth,
    terminalDocked,
    terminalDockHeight,
    checkOpenTabConflicts,
    setLayout,
    createTask,
    setTaskProvider,
    abortTaskTurn,
    saveActiveEditorTab,
    selectTask,
  ] = useAppStore(useShallow((state) => [
    state.projectPath,
    state.activeTaskId,
    state.layout.taskListCollapsed,
    state.layout.taskListWidth,
    state.layout.editorVisible,
    state.layout.editorPanelWidth,
    state.layout.sidebarOverlayVisible,
    state.layout.explorerPanelWidth,
    state.layout.terminalDocked,
    state.layout.terminalDockHeight ?? 210,
    state.checkOpenTabConflicts,
    state.setLayout,
    state.createTask,
    state.setTaskProvider,
    state.abortTaskTurn,
    state.saveActiveEditorTab,
    state.selectTask,
  ] as const));
  const activeTask = useAppStore((state) => state.tasks.find((task) => task.id === state.activeTaskId));
  const tasks = useAppStore((state) => state.tasks);
  const hasProject = Boolean(projectPath);
  const panelRowRef = useRef<HTMLDivElement>(null);
  const pendingLayoutPatchRef = useRef<Partial<Record<ResizableLayoutKey, number>> | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null);
  const zoomHudTimerRef = useRef<number | null>(null);

  function flushPendingLayoutPatch() {
    if (!pendingLayoutPatchRef.current) {
      return;
    }
    setLayout({ patch: pendingLayoutPatchRef.current });
    pendingLayoutPatchRef.current = null;
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
  }

  function scheduleLayoutResizePatch(key: ResizableLayoutKey, value: number) {
    pendingLayoutPatchRef.current = {
      ...(pendingLayoutPatchRef.current ?? {}),
      [key]: value,
    };
    if (resizeFrameRef.current !== null) {
      return;
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      if (!pendingLayoutPatchRef.current) {
        return;
      }
      const patch = pendingLayoutPatchRef.current;
      pendingLayoutPatchRef.current = null;
      setLayout({ patch });
    });
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void checkOpenTabConflicts();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [checkOpenTabConflicts]);

  useEffect(() => {
    const unsubscribe = window.api?.window?.subscribeZoomChanges?.(({ percent }) => {
      setZoomHudPercent(percent);
      if (zoomHudTimerRef.current !== null) {
        window.clearTimeout(zoomHudTimerRef.current);
      }
      zoomHudTimerRef.current = window.setTimeout(() => {
        setZoomHudPercent(null);
        zoomHudTimerRef.current = null;
      }, 1200);
    });
    return () => {
      if (zoomHudTimerRef.current !== null) {
        window.clearTimeout(zoomHudTimerRef.current);
      }
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod) {
        if (event.key === "Escape") {
          abortTaskTurn({ taskId: activeTaskId });
        }
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        createTask({ title: "" });
        return;
      }

      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        const nextVisible = !sidebarOverlayVisible;
        setLayout({ patch: { sidebarOverlayVisible: nextVisible } });
        if (nextVisible) {
          window.dispatchEvent(new CustomEvent("stave:right-panel-tab", { detail: "changes" }));
        }
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setLayout({ patch: { editorVisible: !editorVisible } });
        return;
      }

      if (event.key === "`") {
        event.preventDefault();
        setLayout({ patch: { terminalDocked: !terminalDocked } });
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveEditorTab();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (!activeTask) {
          return;
        }
        const nextProvider = getNextProviderId({ providerId: activeTask.provider });
        setTaskProvider({ taskId: activeTaskId, provider: nextProvider });
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "j" || event.key === "ArrowDown")) {
        event.preventDefault();
        const currentIndex = tasks.findIndex((task) => task.id === activeTaskId);
        const nextIndex = currentIndex >= 0 ? Math.min(tasks.length - 1, currentIndex + 1) : 0;
        const nextTaskId = tasks[nextIndex]?.id;
        if (nextTaskId) {
          selectTask({ taskId: nextTaskId });
        }
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "k" || event.key === "ArrowUp")) {
        event.preventDefault();
        const currentIndex = tasks.findIndex((task) => task.id === activeTaskId);
        const prevIndex = currentIndex >= 0 ? Math.max(0, currentIndex - 1) : 0;
        const prevTaskId = tasks[prevIndex]?.id;
        if (prevTaskId) {
          selectTask({ taskId: prevTaskId });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [abortTaskTurn, activeTask, activeTaskId, createTask, editorVisible, saveActiveEditorTab, selectTask, setLayout, setTaskProvider, sidebarOverlayVisible, tasks, terminalDocked]);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      {zoomHudPercent !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-50 -translate-x-1/2">
          <div className="rounded-full border border-border/80 bg-card/95 px-3 py-1 text-sm font-medium text-foreground shadow-lg backdrop-blur-sm">
            Zoom {zoomHudPercent}%
          </div>
        </div>
      ) : null}
      <Toaster />
      <TopBar />
      <div className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border/70 bg-muted/50">
        {hasProject ? <WorkspaceBar /> : null}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {hasProject ? (
            <div className="flex min-h-0 flex-col pb-2">
              <RenderProfiler id="TaskList">
                <TaskList />
              </RenderProfiler>
            </div>
          ) : null}
          {hasProject && !taskListCollapsed ? (
            <div
              className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
              onMouseDown={(event) => {
                event.preventDefault();
                const startX = event.clientX;
                const startWidth = taskListWidth;
                const onMove = (moveEvent: MouseEvent) => {
                  const next = Math.max(160, Math.min(340, startWidth + (moveEvent.clientX - startX)));
                  scheduleLayoutResizePatch("taskListWidth", next);
                };
                const onUp = () => {
                  flushPendingLayoutPatch();
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            />
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-2">
            <div ref={panelRowRef} className="flex min-h-0 flex-1 overflow-hidden pr-2">
              <div className="min-h-0 min-w-[420px] flex-1">
                <ChatArea />
              </div>
              {editorVisible ? (
                <>
                  <div
                    className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const startWidth = editorPanelWidth;
                      const onMove = (moveEvent: MouseEvent) => {
                        const containerWidth = panelRowRef.current?.offsetWidth ?? 9999;
                        const explorerWidth = sidebarOverlayVisible ? explorerPanelWidth : 0;
                        const separators = sidebarOverlayVisible ? 10 : 5;
                        const chatMinWidth = 420;
                        const maxEditor = Math.max(320, containerWidth - chatMinWidth - explorerWidth - separators);
                        const delta = startX - moveEvent.clientX;
                        const next = Math.max(320, Math.min(maxEditor, startWidth + delta));
                        scheduleLayoutResizePatch("editorPanelWidth", next);
                      };
                      const onUp = () => {
                        flushPendingLayoutPatch();
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                  <div className="hidden h-full lg:block" style={{ width: `${editorPanelWidth}px` }}>
                    <RenderProfiler id="EditorMainPanel" thresholdMs={10}>
                      <EditorMainPanel />
                    </RenderProfiler>
                  </div>
                </>
              ) : null}
              {sidebarOverlayVisible ? (
                <>
                  <div
                    className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const startWidth = explorerPanelWidth;
                      const onMove = (moveEvent: MouseEvent) => {
                        const containerWidth = panelRowRef.current?.offsetWidth ?? 9999;
                        const editorWidth = editorVisible ? editorPanelWidth : 0;
                        const separators = editorVisible ? 10 : 5;
                        const chatMinWidth = 420;
                        const maxExplorer = Math.max(200, containerWidth - chatMinWidth - editorWidth - separators);
                        const delta = startX - moveEvent.clientX;
                        const next = Math.max(200, Math.min(maxExplorer, startWidth + delta));
                        scheduleLayoutResizePatch("explorerPanelWidth", next);
                      };
                      const onUp = () => {
                        flushPendingLayoutPatch();
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                  <Suspense fallback={<aside className="rounded-lg border border-border/80 bg-card p-3 text-sm text-muted-foreground shadow-sm" style={{ width: `${explorerPanelWidth}px` }}>Loading panel...</aside>}>
                    <div className="hidden h-full lg:block" style={{ width: `${explorerPanelWidth}px` }}>
                      <RenderProfiler id="EditorPanel" thresholdMs={8}>
                        <EditorPanel />
                      </RenderProfiler>
                    </div>
                  </Suspense>
                </>
              ) : null}
            </div>
            {terminalDocked ? (
              <>
                <div
                  className="h-[5px] shrink-0 cursor-row-resize transition-colors hover:bg-border/50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    const startY = event.clientY;
                    const startHeight = terminalDockHeight;
                    const onMove = (moveEvent: MouseEvent) => {
                      const delta = startY - moveEvent.clientY;
                      const next = Math.max(120, Math.min(420, startHeight + delta));
                      scheduleLayoutResizePatch("terminalDockHeight", next);
                    };
                    const onUp = () => {
                      flushPendingLayoutPatch();
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                />
                <TerminalDock />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
