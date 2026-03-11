import { LoaderCircle } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { WorkspaceIdentityMark, getWorkspaceAccentTone } from "@/components/layout/workspace-accent";
import { cn } from "@/lib/utils";

const CHIP_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

interface WorkspaceChipButtonProps {
  workspaceId: string;
  workspaceName: string;
  isActive: boolean;
  isDefault: boolean;
  isSwitching: boolean;
  isDisabled: boolean;
  onSwitch: (workspaceId: string) => void;
  onDelete: (workspaceId: string, workspaceName: string) => void;
}

export const WorkspaceChipButton = memo(function WorkspaceChipButton({
  workspaceId,
  workspaceName,
  isActive,
  isDefault,
  isSwitching,
  isDisabled,
  onSwitch,
  onDelete,
}: WorkspaceChipButtonProps) {
  const accentTone = getWorkspaceAccentTone({ workspaceName });
  const label = isDefault && workspaceName.toLowerCase() === "default workspace" ? "Default" : workspaceName;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
            isActive
              ? "border-primary/70 bg-primary/12 font-semibold text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_26%,transparent)]"
              : isDefault
                ? "border-border/80 bg-card text-muted-foreground hover:bg-secondary/50"
                : "border-border/80 bg-card text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          )}
          onClick={() => onSwitch(workspaceId)}
          disabled={isDisabled}
          style={CHIP_NO_DRAG_STYLE}
        >
          {isSwitching ? (
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-[0.45rem] border"
              style={{
                backgroundColor: accentTone.background,
                color: accentTone.foreground,
                borderColor: accentTone.border,
              }}
            >
              <LoaderCircle className="size-3 animate-spin" />
            </span>
          ) : (
            <WorkspaceIdentityMark workspaceName={workspaceName} />
          )}
          <span className="max-w-24 truncate">{label}</span>
          {!isDefault && workspaceId !== "base" ? (
            <span
              className="rounded px-1 text-sm text-muted-foreground hover:bg-secondary"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(workspaceId, workspaceName);
              }}
            >
              ×
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
});
