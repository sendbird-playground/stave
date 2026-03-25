import { FileCode2, FolderTree, GitBranch, GitGraph, TerminalSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export function RightRail() {
  const [
    hasProject,
    editorVisible,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    terminalDocked,
    setLayout,
  ] = useAppStore(useShallow((state) => [
    Boolean(state.projectPath),
    state.layout.editorVisible,
    state.layout.sidebarOverlayVisible,
    state.layout.sidebarOverlayTab,
    state.layout.terminalDocked,
    state.setLayout,
  ] as const));

  function toggleSidebarTab(tab: "explorer" | "changes" | "git-graph") {
    if (sidebarOverlayVisible && sidebarOverlayTab === tab) {
      setLayout({ patch: { sidebarOverlayVisible: false } });
      return;
    }
    setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: tab,
      },
    });
  }

  return (
    <aside className="hidden h-full w-14 shrink-0 border-l border-border/70 bg-card/70 lg:flex lg:flex-col lg:items-center lg:py-3">
      <TooltipProvider>
        <div className="flex w-full flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={editorVisible ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-10 w-10 rounded-md border border-transparent p-0",
                  !editorVisible && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => setLayout({ patch: { editorVisible: !editorVisible } })}
                aria-label="Editor"
              >
                <FileCode2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={sidebarOverlayVisible && sidebarOverlayTab === "explorer" ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-10 w-10 rounded-md border border-transparent p-0",
                  !(sidebarOverlayVisible && sidebarOverlayTab === "explorer") && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => toggleSidebarTab("explorer")}
                aria-label="Explorer"
              >
                <FolderTree className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Explorer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={sidebarOverlayVisible && sidebarOverlayTab === "changes" ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-10 w-10 rounded-md border border-transparent p-0",
                  !(sidebarOverlayVisible && sidebarOverlayTab === "changes") && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => toggleSidebarTab("changes")}
                aria-label="Changes"
              >
                <GitBranch className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Changes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={sidebarOverlayVisible && sidebarOverlayTab === "git-graph" ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-10 w-10 rounded-md border border-transparent p-0",
                  !(sidebarOverlayVisible && sidebarOverlayTab === "git-graph") && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => toggleSidebarTab("git-graph")}
                aria-label="Git Graph"
              >
                <GitGraph className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Git Graph</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={terminalDocked ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-10 w-10 rounded-md border border-transparent p-0",
                  !terminalDocked && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => setLayout({ patch: { terminalDocked: !terminalDocked } })}
                aria-label="Terminal"
              >
                <TerminalSquare className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
