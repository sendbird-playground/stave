import { FileCode2, FolderTree, GitBranch, Info, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [isLargeViewport, setIsLargeViewport] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsLargeViewport(event.matches);
    };

    setIsLargeViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  function toggleEditor() {
    const nextEditorVisible = !editorVisible;
    setLayout({
      patch: {
        editorVisible: nextEditorVisible,
        ...(!isLargeViewport && nextEditorVisible ? { sidebarOverlayVisible: false } : {}),
      },
    });
  }

  function toggleSidebarTab(tab: "explorer" | "changes" | "information") {
    if (sidebarOverlayVisible && sidebarOverlayTab === tab) {
      setLayout({ patch: { sidebarOverlayVisible: false } });
      return;
    }
    setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: tab,
        ...(!isLargeViewport ? { editorVisible: false } : {}),
      },
    });
  }

  const editorActive = editorVisible;
  const explorerActive = sidebarOverlayVisible && sidebarOverlayTab === "explorer";
  const changesActive = sidebarOverlayVisible && sidebarOverlayTab === "changes";
  const informationActive = sidebarOverlayVisible && sidebarOverlayTab === "information";

  return (
    <aside
      data-testid="workspace-bar"
      className="flex h-full w-12 shrink-0 flex-col items-center border-l border-border/70 bg-card/70 py-2 lg:w-14 lg:py-3"
    >
      <TooltipProvider>
        <div className="flex w-full flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={editorActive ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10",
                  !editorActive && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={toggleEditor}
                aria-label="Editor"
              >
                <FileCode2 className="size-3.5 lg:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={explorerActive ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10",
                  !explorerActive && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => toggleSidebarTab("explorer")}
                aria-label="Explorer"
              >
                <FolderTree className="size-3.5 lg:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Explorer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={changesActive ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10",
                  !changesActive && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => toggleSidebarTab("changes")}
                aria-label="Changes"
              >
                <GitBranch className="size-3.5 lg:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Changes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={informationActive ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10",
                  !informationActive && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => toggleSidebarTab("information")}
                aria-label="Information"
              >
                <Info className="size-3.5 lg:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Information</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={terminalDocked ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10",
                  !terminalDocked && "hover:border-border/80 hover:bg-secondary/70"
                )}
                onClick={() => setLayout({ patch: { terminalDocked: !terminalDocked } })}
                aria-label="Terminal"
              >
                <TerminalSquare className="size-3.5 lg:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
