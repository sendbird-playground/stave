import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppStore } from "@/store/app.store";

export default function App() {
  useEffect(() => {
    void useAppStore.getState().hydrateWorkspaces();
    void useAppStore.getState().refreshProviderAvailability();
    const timer = window.setInterval(() => {
      void useAppStore.getState().refreshProviderAvailability();
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let timer: number | null = null;

    const scheduleSnapshotFlush = (state: ReturnType<typeof useAppStore.getState>) => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (!state.hasHydratedWorkspaces || !state.activeWorkspaceId) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        void useAppStore.getState().flushActiveWorkspaceSnapshot();
      }, 1200);
    };

    scheduleSnapshotFlush(useAppStore.getState());
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (
        state.hasHydratedWorkspaces === prevState.hasHydratedWorkspaces
        && state.activeWorkspaceId === prevState.activeWorkspaceId
        && state.workspaceSnapshotVersion === prevState.workspaceSnapshotVersion
      ) {
        return;
      }
      scheduleSnapshotFlush(state);
    });

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      void useAppStore.getState().flushActiveWorkspaceSnapshot({ sync: true });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <>
      <AppShell />
    </>
  );
}
