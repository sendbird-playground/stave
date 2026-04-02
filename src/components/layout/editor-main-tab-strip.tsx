import { AlertTriangle, FileCode2, X } from "lucide-react";
import type { DragEvent } from "react";
import { Badge, Button } from "@/components/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { EditorTab } from "@/types/chat";

function isChatDiffTab(tab: { id: string; kind?: "text" | "image"; originalContent?: string } | null) {
  return Boolean(tab && tab.kind !== "image" && !tab.id.startsWith("file:") && tab.originalContent != null);
}

function formatTabLabel(filePath: string) {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

function formatTabDirectory(filePath: string) {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "Workspace root";
  }
  return segments.slice(0, -1).join(" / ");
}

export function EditorMainTabStrip(args: {
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  draggingTabId: string | null;
  dropTargetTabId: string | null;
  onSetDraggingTabId: (tabId: string | null) => void;
  onSetDropTargetTabId: (tabId: string | null) => void;
  onTabDragStart: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
  onTabDrop: (event: DragEvent<HTMLDivElement>, toTabId: string) => void;
  onActivateTab: (tabId: string) => void;
  onRequestCloseTab: (tabId: string) => void;
  onRequestCloseTabs: (args: { tabIds: string[]; title: string; description: string }) => void;
  onCopyPath: (filePath: string) => void;
  onCopyRelativePath: (filePath: string) => void;
  onCopyBreadcrumbs: (filePath: string) => void;
}) {
  if (args.editorTabs.length === 0) {
    return null;
  }

  return (
    <div
      className="tab-strip-scroll min-w-0 w-full max-w-full flex items-end gap-1 overflow-x-auto border-b border-border/70 bg-editor/65 px-2 pt-2"
      onWheel={(event) => {
        if (event.deltaY !== 0) {
          event.currentTarget.scrollLeft += event.deltaY;
          event.preventDefault();
        }
      }}
    >
      {args.editorTabs.map((tab) => {
        const isActive = tab.id === args.activeEditorTabId;
        const isDiffTab = isChatDiffTab(tab);
        const directoryLabel = formatTabDirectory(tab.filePath);
        const closeButtonClassName = isActive
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

        return (
          <ContextMenu key={tab.id} onOpenChange={(open) => { if (open) args.onActivateTab(tab.id); }}>
            <ContextMenuTrigger asChild>
              <div
                draggable
                onDragStart={(event) => args.onTabDragStart(event, tab.id)}
                onDragEnd={() => {
                  args.onSetDraggingTabId(null);
                  args.onSetDropTargetTabId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (args.draggingTabId && args.draggingTabId !== tab.id) {
                    args.onSetDropTargetTabId(tab.id);
                  }
                }}
                onDrop={(event) => args.onTabDrop(event, tab.id)}
                className={cn(
                  "group relative -mb-px flex h-[54px] shrink-0 items-stretch overflow-hidden rounded-t-lg border px-2 py-0 transition-[background-color,border-color,box-shadow,color,opacity] duration-150",
                  isActive
                    ? "border-border/80 border-b-editor bg-editor-tab-active text-editor-foreground shadow-[0_12px_28px_-24px_rgba(15,23,42,0.85)]"
                    : "border-transparent border-b-border/80 bg-editor-tab/95 text-muted-foreground hover:border-border/70 hover:bg-editor-muted/90 hover:text-editor-foreground",
                  args.draggingTabId === tab.id && "opacity-70",
                  args.dropTargetTabId === tab.id && args.draggingTabId && args.draggingTabId !== tab.id && "ring-1 ring-primary/60 ring-inset",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
                  title={tab.filePath}
                  onClick={() => args.onActivateTab(tab.id)}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                      isActive
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border/60 bg-background/50 text-muted-foreground group-hover:border-border/80 group-hover:text-editor-foreground",
                    )}
                  >
                    <FileCode2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium leading-tight">{formatTabLabel(tab.filePath)}</span>
                      {tab.isDirty ? <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
                      <span className="truncate">{directoryLabel}</span>
                      {isDiffTab ? (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 rounded-sm border-primary/20 bg-primary/10 px-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-primary"
                        >
                          Diff
                        </Badge>
                      ) : null}
                      {tab.hasConflict ? (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-1 rounded-sm border-warning/30 bg-warning/10 px-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-warning-foreground"
                        >
                          <AlertTriangle className="size-2.5" />
                          Conflict
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </button>
                <div className="flex items-start py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`close-${tab.filePath}`}
                    className={cn(
                      "mt-0.5 size-6 rounded-md p-0 text-muted-foreground transition-[opacity,color,background-color] duration-150 hover:bg-editor-muted hover:text-editor-foreground",
                      closeButtonClassName,
                    )}
                    onClick={() => args.onRequestCloseTab(tab.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <span
                  className={cn(
                    "pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-opacity duration-150",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
                  )}
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => args.onRequestCloseTab(tab.id)}>Close</ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  args.onRequestCloseTabs({
                    tabIds: args.editorTabs.filter((editorTab) => editorTab.id !== tab.id).map((editorTab) => editorTab.id),
                    title: "Close Other Tabs",
                    description: "Close all tabs except this tab?",
                  })
                }
              >
                Close Others
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  const startIndex = args.editorTabs.findIndex((editorTab) => editorTab.id === tab.id);
                  const rightTabIds = startIndex >= 0
                    ? args.editorTabs.slice(startIndex + 1).map((editorTab) => editorTab.id)
                    : [];
                  args.onRequestCloseTabs({
                    tabIds: rightTabIds,
                    title: "Close Tabs to the Right",
                    description: "Close all tabs to the right?",
                  });
                }}
              >
                Close to the Right
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  args.onRequestCloseTabs({
                    tabIds: args.editorTabs.filter((editorTab) => !editorTab.isDirty).map((editorTab) => editorTab.id),
                    title: "Close Saved Tabs",
                    description: "Close all saved tabs?",
                  })
                }
              >
                Close Saved
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  args.onRequestCloseTabs({
                    tabIds: args.editorTabs.map((editorTab) => editorTab.id),
                    title: "Close All Tabs",
                    description: "Close all open tabs?",
                  })
                }
              >
                Close All
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => args.onCopyPath(tab.filePath)}>
                Copy Path
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => args.onCopyRelativePath(tab.filePath)}>
                Copy Relative Path
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => args.onCopyBreadcrumbs(tab.filePath)}>
                Copy Breadcrumbs Path
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
