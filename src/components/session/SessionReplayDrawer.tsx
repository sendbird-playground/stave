import { Clock3, TriangleAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Badge, Button, Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { TurnDiagnosticsPanel, type TurnReplayHeaderMeta } from "@/components/session/TurnDiagnosticsPanel";
import type { ReplayEventFilter } from "@/components/session/turn-diagnostics-panel.utils";
import { useShallow } from "zustand/react/shallow";

interface SessionReplayDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: SessionReplayRequestContext | null;
}

export interface SessionReplayRequestContext {
  key: number;
  view?: "overview" | "replay";
  replayFilter?: ReplayEventFilter;
}

function SessionReplayDrawerBody({
  onOpenChange,
  request,
}: Omit<SessionReplayDrawerProps, "open">) {
  const [
    activeWorkspaceId,
    activeTaskId,
    activeTaskTitle,
    activeTaskProvider,
    activeTurnId,
    providerConversations,
  ] = useAppStore(useShallow((state) => {
    const activeTask = state.tasks.find((task) => task.id === state.activeTaskId);
    return [
      state.activeWorkspaceId,
      state.activeTaskId,
      activeTask?.title ?? null,
      activeTask?.provider ?? null,
      state.activeTurnIdsByTask[state.activeTaskId],
      state.providerConversationByTask[state.activeTaskId],
    ] as const;
  }));

  const taskProviderLabel = useMemo(
    () => getProviderLabel({ providerId: activeTaskProvider ?? "claude-code" }),
    [activeTaskProvider]
  );

  const [headerMeta, setHeaderMeta] = useState<TurnReplayHeaderMeta | null>(null);

  const handleHeaderMetaChange = useCallback((meta: TurnReplayHeaderMeta) => {
    setHeaderMeta((prev) => {
      if (
        prev &&
        prev.loading === meta.loading &&
        prev.detailLoading === meta.detailLoading &&
        prev.error === meta.error &&
        prev.statusLabel === meta.statusLabel &&
        prev.statusVariant === meta.statusVariant &&
        prev.totalEvents === meta.totalEvents &&
        prev.previewEventCount === meta.previewEventCount &&
        prev.isLatest === meta.isLatest &&
        prev.isLive === meta.isLive &&
        prev.durationLabel === meta.durationLabel &&
        prev.timeAgo === meta.timeAgo &&
        prev.stopReason === meta.stopReason &&
        prev.lastEventType === meta.lastEventType
      ) {
        return prev;
      }
      return meta;
    });
  }, []);

  const hasError = headerMeta?.statusVariant === "destructive";

  return (
    <Drawer open onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(64rem,96vw)] data-[vaul-drawer-direction=right]:sm:max-w-[64rem]">
        <DrawerHeader className="gap-3 border-b border-border/70 px-5 pb-5 pt-5 text-left md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              {hasError ? <TriangleAlert className="size-4 text-destructive" /> : <Clock3 className="size-4 text-muted-foreground" />}
              Session Replay
            </span>
            {activeTaskProvider ? <Badge variant="outline">{taskProviderLabel}</Badge> : null}
            {headerMeta?.statusLabel && headerMeta.statusVariant ? (
              <Badge variant={headerMeta.statusVariant}>{headerMeta.statusLabel}</Badge>
            ) : null}
            {headerMeta?.totalEvents != null ? (
              <Badge variant="secondary">{headerMeta.totalEvents} events</Badge>
            ) : headerMeta?.previewEventCount != null ? (
              <Badge variant="secondary">{headerMeta.previewEventCount} events</Badge>
            ) : null}
            {headerMeta?.isLatest ? <Badge variant="outline">Latest</Badge> : null}
            {headerMeta?.isLive ? <Badge variant="warning">Live</Badge> : null}
          </div>
          <div className="space-y-1">
            <DrawerTitle className="text-lg font-semibold">
              {activeTaskTitle ?? "No active task"}
            </DrawerTitle>
            <DrawerDescription>
              Review persisted turn events, provider session metadata, and request snapshots without pushing the conversation down.
            </DrawerDescription>
          </div>
          {headerMeta ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {headerMeta.loading ? <span>Loading session replay...</span> : null}
              {headerMeta.detailLoading ? <span>Loading selected turn...</span> : null}
              {headerMeta.error ? <span>{headerMeta.error}</span> : null}
              {headerMeta.durationLabel ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />
                  {headerMeta.durationLabel}
                </span>
              ) : null}
              {headerMeta.timeAgo ? <span>{headerMeta.timeAgo}</span> : null}
              {headerMeta.stopReason ? <span>stop: {headerMeta.stopReason}</span> : null}
              {headerMeta.lastEventType ? <span>last: {headerMeta.lastEventType}</span> : null}
            </div>
          ) : null}
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeWorkspaceId && activeTaskId && activeTaskProvider ? (
            <TurnDiagnosticsPanel
              workspaceId={activeWorkspaceId}
              taskId={activeTaskId}
              activeTurnId={activeTurnId}
              taskProvider={activeTaskProvider}
              providerConversations={providerConversations}
              surface="drawer"
              defaultOpen
              requestKey={request?.key}
              requestedView={request?.view}
              requestedReplayFilter={request?.replayFilter}
              onHeaderMetaChange={handleHeaderMetaChange}
            />
          ) : (
            <div className="px-5 py-6 text-sm text-muted-foreground md:px-6">
              No active task is selected.
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border/70 px-5 py-4 md:px-6">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function SessionReplayDrawer({ open, onOpenChange, request }: SessionReplayDrawerProps) {
  if (!open) {
    return null;
  }

  return <SessionReplayDrawerBody onOpenChange={onOpenChange} request={request} />;
}
