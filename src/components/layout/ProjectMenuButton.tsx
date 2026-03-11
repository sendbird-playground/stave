import { ChevronDown, Folder, FolderPlus } from "lucide-react";
import { memo, useState, type CSSProperties } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ProjectMenuButtonProps {
  projectName: string | null;
  currentBranch: string;
  onCreateProject: () => void;
  noDragStyle: CSSProperties;
}

export const ProjectMenuButton = memo(function ProjectMenuButton({
  projectName,
  currentBranch,
  onCreateProject,
  noDragStyle,
}: ProjectMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const label = projectName ?? "No Project";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="project-menu"
                className={cn(
                  "h-9 max-w-44 rounded-md border border-border/70 bg-card px-2.5 text-sm transition-colors md:max-w-60",
                  open && "border-primary/70 bg-secondary/80",
                )}
                style={noDragStyle}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="start" sideOffset={8} className="w-[22rem]" style={noDragStyle}>
        <DropdownMenuItem
          className="h-10 justify-start gap-2 rounded-md px-3 text-sm"
          onClick={() => {
            setOpen(false);
            onCreateProject();
          }}
        >
          <FolderPlus className="size-4 text-muted-foreground" />
          Create project (select folder)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Current Project</DropdownMenuLabel>
        <div className="rounded-sm border border-border bg-muted/30 px-2 py-2">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-sm text-muted-foreground">{currentBranch}</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
