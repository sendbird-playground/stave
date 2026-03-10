import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppStore } from "@/store/app.store";

export default function App() {
  const hasHydratedWorkspaces = useAppStore((state) => state.hasHydratedWorkspaces);
  const hydrateWorkspaces = useAppStore((state) => state.hydrateWorkspaces);
  const flushActiveWorkspaceSnapshot = useAppStore((state) => state.flushActiveWorkspaceSnapshot);
  const refreshProviderAvailability = useAppStore((state) => state.refreshProviderAvailability);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const tasks = useAppStore((state) => state.tasks);
  const messagesByTask = useAppStore((state) => state.messagesByTask);

  useEffect(() => {
    void hydrateWorkspaces();
    void refreshProviderAvailability();
    const timer = window.setInterval(() => {
      void refreshProviderAvailability();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [hydrateWorkspaces, refreshProviderAvailability]);

  useEffect(() => {
    if (!hasHydratedWorkspaces || !activeWorkspaceId) {
      return;
    }
    const timer = window.setTimeout(() => {
      void flushActiveWorkspaceSnapshot();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeWorkspaceId, activeTaskId, hasHydratedWorkspaces, tasks, messagesByTask, flushActiveWorkspaceSnapshot]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void flushActiveWorkspaceSnapshot({ sync: true });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flushActiveWorkspaceSnapshot]);

  return (
    <>
      <AppShell />
    </>
  );
}
