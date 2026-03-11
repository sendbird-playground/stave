import { memo, useCallback, useMemo, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { WorkspaceChipButton } from "@/components/layout/WorkspaceChipButton";
import { useAppStore } from "@/store/app.store";

interface TopBarWorkspaceSwitcherProps {
  noDragStyle: CSSProperties;
  onRequestCreateWorkspace: () => void;
  onRequestDeleteWorkspace: (workspaceId: string, workspaceName: string) => void;
}

export const TopBarWorkspaceSwitcher = memo(function TopBarWorkspaceSwitcher({
  noDragStyle,
  onRequestCreateWorkspace,
  onRequestDeleteWorkspace,
}: TopBarWorkspaceSwitcherProps) {
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [workspaces, activeWorkspaceId, workspaceDefaultById, switchWorkspace] = useAppStore(useShallow((state) => [
    state.workspaces,
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.switchWorkspace,
  ] as const));

  const orderedWorkspaceView = useMemo(() => {
    return [...workspaces]
      .sort((a, b) => {
        const aDefault = workspaceDefaultById[a.id] ? 0 : 1;
        const bDefault = workspaceDefaultById[b.id] ? 0 : 1;
        if (aDefault !== bDefault) {
          return aDefault - bDefault;
        }
        return 0;
      })
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        isDefault: Boolean(workspaceDefaultById[workspace.id]),
      }));
  }, [workspaces, workspaceDefaultById]);

  const handleWorkspaceSwitch = useCallback((workspaceId: string) => {
    if (workspaceId === activeWorkspaceId || switchingWorkspaceId) {
      return;
    }

    setSwitchingWorkspaceId(workspaceId);
    void switchWorkspace({ workspaceId }).finally(() => {
      setSwitchingWorkspaceId(null);
    });
  }, [activeWorkspaceId, switchWorkspace, switchingWorkspaceId]);

  return (
    <TooltipProvider>
      <div className="hidden items-center gap-1 md:flex">
        {orderedWorkspaceView.map((workspace) => (
          <WorkspaceChipButton
            key={workspace.id}
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            isActive={workspace.id === activeWorkspaceId}
            isDefault={workspace.isDefault}
            isSwitching={switchingWorkspaceId === workspace.id}
            isDisabled={Boolean(switchingWorkspaceId && switchingWorkspaceId !== workspace.id)}
            onSwitch={handleWorkspaceSwitch}
            onDelete={onRequestDeleteWorkspace}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-border/80" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="new-workspace"
              className="h-9 rounded-md px-3 text-sm"
              onClick={onRequestCreateWorkspace}
              style={noDragStyle}
            >
              + New Workspace
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Create a new workspace</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
});
