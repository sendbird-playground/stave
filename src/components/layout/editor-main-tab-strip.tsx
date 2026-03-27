import { X } from "lucide-react";
import type { DragEvent } from "react";
import { Badge, Button } from "@/components/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { EditorTab } from "@/types/chat";

function isChatDiffTab(tab: { id: string; kind?: "text" | "image"; originalContent?: string } | null) {
  return Boolean(tab && tab.kind !== "image" && !tab.id.startsWith("file:") && tab.originalContent != null);
}

function formatTabLabel(filePath: string) {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
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
      className="tab-strip-scroll min-w-0 w-full max-w-full flex items-end gap-0.5 overflow-x-auto border-b border-border/80 bg-transparent pt-px"
      onWheel={(event) => {
        if (event.deltaY !== 0) {
          event.currentTarget.scrollLeft += event.deltaY;
          event.preventDefault();
        }
      }}
    >
      {args.editorTabs.map((tab) => (
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
              className={[
                "group -mb-px flex shrink-0 items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-sm transition-colors",
                tab.id === args.activeEditorTabId
                  ? "border-border/80 border-b-editor bg-editor-tab-active text-editor-foreground"
                  : "border-transparent border-b-border/80 bg-editor-tab text-muted-foreground hover:bg-editor-muted hover:text-editor-foreground",
                args.dropTargetTabId === tab.id && args.draggingTabId && args.draggingTabId !== tab.id ? "outline outline-1 outline-primary/60" : "",
              ].join(" ")}
            >
              <button
                type="button"
                className="max-w-56 min-w-0 truncate text-left"
                title={tab.filePath}
                onClick={() => args.onActivateTab(tab.id)}
              >
                {formatTabLabel(tab.filePath)}
              </button>
              {isChatDiffTab(tab) ? (
                <Badge variant="outline" className="h-4 rounded-sm px-1 text-[10px] uppercase tracking-[0.08em]">
                  Diff
                </Badge>
              ) : null}
              {tab.isDirty ? <span className="text-sm leading-none text-success">●</span> : null}
              {tab.hasConflict ? <span className="rounded px-1 text-sm font-medium text-warning">!</span> : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`close-${tab.filePath}`}
                className={[
                  "ml-1 size-4 rounded-sm p-0 transition-colors",
                  "text-muted-foreground hover:bg-editor-muted hover:text-editor-foreground",
                  tab.id === args.activeEditorTabId ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                ].join(" ")}
                onClick={() => args.onRequestCloseTab(tab.id)}
              >
                <X className="size-3" />
              </Button>
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
      ))}
    </div>
  );
}
