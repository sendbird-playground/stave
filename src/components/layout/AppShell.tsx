import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { WorkspaceBar } from "@/components/layout/WorkspaceBar";
import { TaskList } from "@/components/layout/TaskList";
import { ChatArea } from "@/components/session/ChatArea";
import { TerminalDock } from "@/components/layout/TerminalDock";
import { Toaster } from "@/components/ui";
import { getNextProviderId } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { EditorMainPanel } from "@/components/layout/EditorMainPanel";

const EditorPanel = lazy(() =>
  import("@/components/layout/EditorPanel").then((module) => ({
    default: module.EditorPanel,
  }))
);

export function AppShell() {
  const layout = useAppStore((state) => state.layout);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const tasks = useAppStore((state) => state.tasks);
  const checkOpenTabConflicts = useAppStore((state) => state.checkOpenTabConflicts);
  const setLayout = useAppStore((state) => state.setLayout);
  const createTask = useAppStore((state) => state.createTask);
  const setTaskProvider = useAppStore((state) => state.setTaskProvider);
  const abortTaskTurn = useAppStore((state) => state.abortTaskTurn);
  const saveActiveEditorTab = useAppStore((state) => state.saveActiveEditorTab);
  const selectTask = useAppStore((state) => state.selectTask);
  const terminalDockHeight = layout.terminalDockHeight ?? 210;
  const panelRowRef = useRef<HTMLDivElement>(null);
  const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null);
  const zoomHudTimerRef = useRef<number | null>(null);

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
        const nextVisible = !layout.sidebarOverlayVisible;
        setLayout({ patch: { sidebarOverlayVisible: nextVisible } });
        if (nextVisible) {
          window.dispatchEvent(new CustomEvent("stave:right-panel-tab", { detail: "changes" }));
        }
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setLayout({ patch: { editorVisible: !layout.editorVisible } });
        return;
      }

      if (event.key === "`") {
        event.preventDefault();
        setLayout({ patch: { terminalDocked: !layout.terminalDocked } });
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveEditorTab();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        const activeTask = tasks.find((task) => task.id === activeTaskId);
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
  }, [abortTaskTurn, activeTaskId, createTask, layout.editorVisible, layout.sidebarOverlayVisible, layout.terminalDocked, saveActiveEditorTab, selectTask, setLayout, setTaskProvider, tasks]);

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
        <WorkspaceBar />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-col pb-2">
            <TaskList />
          </div>
          {!layout.taskListCollapsed ? (
            <div
              className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
              onMouseDown={(event) => {
                event.preventDefault();
                const startX = event.clientX;
                const startWidth = layout.taskListWidth;
                const onMove = (moveEvent: MouseEvent) => {
                  const next = Math.max(160, Math.min(340, startWidth + (moveEvent.clientX - startX)));
                  setLayout({ patch: { taskListWidth: next } });
                };
                const onUp = () => {
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
              {layout.editorVisible ? (
                <>
                  <div
                    className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const startWidth = layout.editorPanelWidth;
                      const onMove = (moveEvent: MouseEvent) => {
                        const containerWidth = panelRowRef.current?.offsetWidth ?? 9999;
                        const explorerWidth = layout.sidebarOverlayVisible ? layout.explorerPanelWidth : 0;
                        const separators = layout.sidebarOverlayVisible ? 10 : 5;
                        const chatMinWidth = 420;
                        const maxEditor = Math.max(320, containerWidth - chatMinWidth - explorerWidth - separators);
                        const delta = startX - moveEvent.clientX;
                        const next = Math.max(320, Math.min(maxEditor, startWidth + delta));
                        setLayout({ patch: { editorPanelWidth: next } });
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                  <div className="hidden h-full lg:block" style={{ width: `${layout.editorPanelWidth}px` }}>
                    <EditorMainPanel />
                  </div>
                </>
              ) : null}
              {layout.sidebarOverlayVisible ? (
                <>
                  <div
                    className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const startWidth = layout.explorerPanelWidth;
                      const onMove = (moveEvent: MouseEvent) => {
                        const containerWidth = panelRowRef.current?.offsetWidth ?? 9999;
                        const editorWidth = layout.editorVisible ? layout.editorPanelWidth : 0;
                        const separators = layout.editorVisible ? 10 : 5;
                        const chatMinWidth = 420;
                        const maxExplorer = Math.max(200, containerWidth - chatMinWidth - editorWidth - separators);
                        const delta = startX - moveEvent.clientX;
                        const next = Math.max(200, Math.min(maxExplorer, startWidth + delta));
                        setLayout({ patch: { explorerPanelWidth: next } });
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                  <Suspense fallback={<aside className="rounded-lg border border-border/80 bg-card p-3 text-sm text-muted-foreground shadow-sm" style={{ width: `${layout.explorerPanelWidth}px` }}>Loading panel...</aside>}>
                    <div className="hidden h-full lg:block" style={{ width: `${layout.explorerPanelWidth}px` }}>
                      <EditorPanel />
                    </div>
                  </Suspense>
                </>
              ) : null}
            </div>
            {layout.terminalDocked ? (
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
                      setLayout({ patch: { terminalDockHeight: next } });
                    };
                    const onUp = () => {
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
