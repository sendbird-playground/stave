import { Activity } from "lucide-react";
import { useMemo } from "react";
import { Badge, Button, Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { TurnDiagnosticsPanel } from "@/components/session/TurnDiagnosticsPanel";
import type { ReplayEventFilter } from "@/components/session/turn-diagnostics-panel.utils";

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

export function SessionReplayDrawer({ open, onOpenChange, request }: SessionReplayDrawerProps) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeTask = useAppStore((state) => state.tasks.find((task) => task.id === state.activeTaskId));
  const activeTurnId = useAppStore((state) => state.activeTurnIdsByTask[state.activeTaskId]);
  const providerConversations = useAppStore((state) => state.providerConversationByTask[state.activeTaskId]);

  const taskProviderLabel = useMemo(
    () => getProviderLabel({ providerId: activeTask?.provider ?? "claude-code" }),
    [activeTask?.provider]
  );

  if (!open) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(64rem,96vw)] data-[vaul-drawer-direction=right]:sm:max-w-[64rem]">
        <DrawerHeader className="gap-3 border-b border-border/70 px-5 pb-5 pt-5 text-left md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Activity className="size-4 text-muted-foreground" />
              Session Replay
            </span>
            {activeTask ? <Badge variant="outline">{taskProviderLabel}</Badge> : null}
          </div>
          <div className="space-y-1">
            <DrawerTitle className="text-lg font-semibold">
              {activeTask?.title ?? "No active task"}
            </DrawerTitle>
            <DrawerDescription>
              Review persisted turn events, provider session metadata, and request snapshots without pushing the conversation down.
            </DrawerDescription>
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeWorkspaceId && activeTaskId && activeTask ? (
            <TurnDiagnosticsPanel
              workspaceId={activeWorkspaceId}
              taskId={activeTaskId}
              activeTurnId={activeTurnId}
              taskProvider={activeTask.provider}
              providerConversations={providerConversations}
              surface="drawer"
              defaultOpen
              requestKey={request?.key}
              requestedView={request?.view}
              requestedReplayFilter={request?.replayFilter}
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
