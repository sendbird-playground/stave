import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { AppShell } from "@/components/layout/AppShell";
import { useAppStore } from "@/store/app.store";

export default function App() {
  const [
    hasHydratedWorkspaces,
    workspaceSnapshotVersion,
    hydrateWorkspaces,
    flushActiveWorkspaceSnapshot,
    refreshProviderAvailability,
    activeWorkspaceId,
  ] = useAppStore(useShallow((state) => [
    state.hasHydratedWorkspaces,
    state.workspaceSnapshotVersion,
    state.hydrateWorkspaces,
    state.flushActiveWorkspaceSnapshot,
    state.refreshProviderAvailability,
    state.activeWorkspaceId,
  ] as const));

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
  }, [activeWorkspaceId, hasHydratedWorkspaces, workspaceSnapshotVersion, flushActiveWorkspaceSnapshot]);

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
