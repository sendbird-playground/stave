import { ChevronDown, Folder, FolderPlus } from "lucide-react";
import { memo, useState, type CSSProperties } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";

interface RecentProjectMenuItem {
  projectPath: string;
  projectName: string;
  defaultBranch: string;
}

interface ProjectMenuButtonProps {
  projectName: string | null;
  currentProjectPath: string | null;
  recentProjects: RecentProjectMenuItem[];
  currentBranch: string;
  onCreateProject: () => void;
  onOpenProject: (projectPath: string) => void;
  noDragStyle: CSSProperties;
}

export const ProjectMenuButton = memo(function ProjectMenuButton({
  projectName,
  currentProjectPath,
  recentProjects,
  currentBranch,
  onCreateProject,
  onOpenProject,
  noDragStyle,
}: ProjectMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const label = projectName ?? "No Project";
  const recentProjectItems = recentProjects.filter((project) => project.projectPath !== currentProjectPath);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipProvider>
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
            title={label}
          >
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
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
        {recentProjectItems.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Recent Projects</DropdownMenuLabel>
            {recentProjectItems.map((project) => (
              <DropdownMenuItem
                key={project.projectPath}
                className="flex h-auto flex-col items-start gap-0.5 rounded-md px-3 py-2"
                onSelect={() => {
                  setOpen(false);
                  onOpenProject(project.projectPath);
                }}
              >
                <span className="w-full truncate text-sm font-medium">{project.projectName}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{project.projectPath}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{project.defaultBranch}</span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
