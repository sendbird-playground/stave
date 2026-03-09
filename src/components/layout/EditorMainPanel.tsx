import MonacoEditor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import { Columns2, FileCode2, PenLine, Save, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useAppStore } from "@/store/app.store";
import { Badge, Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";

export function EditorMainPanel() {
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspacePathById = useAppStore((state) => state.workspacePathById);
  const projectPath = useAppStore((state) => state.projectPath);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const editorTabs = useAppStore((state) => state.editorTabs);
  const activeEditorTabId = useAppStore((state) => state.activeEditorTabId);
  const layout = useAppStore((state) => state.layout);
  const settings = useAppStore((state) => state.settings);
  const setLayout = useAppStore((state) => state.setLayout);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setActiveEditorTab = useAppStore((state) => state.setActiveEditorTab);
  const reorderEditorTabs = useAppStore((state) => state.reorderEditorTabs);
  const closeEditorTab = useAppStore((state) => state.closeEditorTab);
  const updateEditorContent = useAppStore((state) => state.updateEditorContent);
  const sendEditorContextToChat = useAppStore((state) => state.sendEditorContextToChat);
  const toggleEditorDiffMode = useAppStore((state) => state.toggleEditorDiffMode);
  const saveActiveEditorTab = useAppStore((state) => state.saveActiveEditorTab);
  const [tabToClose, setTabToClose] = useState<{ id: string; fileName: string } | null>(null);
  const [bulkCloseRequest, setBulkCloseRequest] = useState<{ tabIds: string[]; title: string; description: string } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const monacoConfiguredRef = useRef(false);

  const activeTab = editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
  const isImageTab = (tab: { kind?: "text" | "image"; language: string } | null) =>
    Boolean(tab && (tab.kind === "image" || tab.language === "image"));
  const isChatDiffTab = (tab: { id: string; kind?: "text" | "image"; originalContent?: string } | null) =>
    Boolean(tab && tab.kind !== "image" && !tab.id.startsWith("file:") && tab.originalContent != null);
  const activeTabIsImage = isImageTab(activeTab);
  const monacoTheme = isDarkMode ? "vs-dark" : "vs";
  const workspaceRootPath = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const activeModelPath = activeTab ? toMonacoModelPath(activeTab.filePath) : undefined;
  const showDiffDisplayControls = Boolean(layout.editorDiffMode && activeTab?.originalContent != null && !activeTabIsImage);

  function configureMonaco(monaco: Monaco) {
    if (monacoConfiguredRef.current) {
      return;
    }
    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowJs: true,
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      baseUrl: ".",
      paths: {
        "@/*": ["src/*"],
      },
    };

    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      onlyVisible: false,
    });
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monacoConfiguredRef.current = true;

    // Load type definitions from the workspace's node_modules so Monaco can
    // resolve imports without showing false "cannot find module" errors.
    const readTypeDefs = window.api?.fs?.readTypeDefs;
    if (readTypeDefs && workspaceRootPath) {
      void readTypeDefs({ rootPath: workspaceRootPath }).then((result) => {
        if (!result.ok) {
          return;
        }
        for (const lib of result.libs) {
          monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath);
          monaco.languages.typescript.javascriptDefaults.addExtraLib(lib.content, lib.filePath);
        }
      });
    }

    // Register all workspace source files as extra libs so Monaco can resolve
    // path-alias imports (e.g. @/components/...) even when those files aren't open.
    const readSourceFiles = window.api?.fs?.readSourceFiles;
    if (readSourceFiles && workspaceRootPath) {
      void readSourceFiles({ rootPath: workspaceRootPath }).then((result) => {
        if (!result.ok) {
          return;
        }
        for (const file of result.files) {
          monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, file.filePath);
          monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, file.filePath);
        }
      });
    }
  }

  useEffect(() => {
    if (!imagePreviewOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImagePreviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [imagePreviewOpen]);

  function handleTabDragStart(event: DragEvent<HTMLDivElement>, tabId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tabId);
    setDraggingTabId(tabId);
  }

  function handleTabDrop(event: DragEvent<HTMLDivElement>, toTabId: string) {
    event.preventDefault();
    const fromTabId = draggingTabId ?? event.dataTransfer.getData("text/plain");
    if (fromTabId && fromTabId !== toTabId) {
      reorderEditorTabs({ fromTabId, toTabId });
    }
    setDropTargetTabId(null);
    setDraggingTabId(null);
  }

  function requestCloseTab(tabId: string) {
    const tab = editorTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    if (tab.isDirty) {
      setTabToClose({
        id: tab.id,
        fileName: tab.filePath.split("/").filter(Boolean).at(-1) ?? tab.filePath,
      });
      return;
    }
    closeEditorTab({ tabId: tab.id });
  }

  function requestCloseTabs(args: { tabIds: string[]; title: string; description: string }) {
    const uniqueIds = Array.from(new Set(args.tabIds));
    if (uniqueIds.length === 0) {
      return;
    }
    const dirtyCount = uniqueIds.filter((id) => editorTabs.find((tab) => tab.id === id)?.isDirty).length;
    if (dirtyCount > 0) {
      setBulkCloseRequest({
        tabIds: uniqueIds,
        title: args.title,
        description: `${args.description} ${dirtyCount} unsaved tab(s) will also be closed.`,
      });
      return;
    }
    for (const tabId of uniqueIds) {
      closeEditorTab({ tabId });
    }
  }

  async function copyText(value: string) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Keep silent; clipboard API can be denied based on runtime permissions.
    }
  }

  function resolveAbsolutePath(filePath: string) {
    const root = workspaceRootPath.replace(/[\\/]+$/, "");
    const relative = filePath.replace(/^[/\\]+/, "");
    if (!root) {
      return filePath;
    }
    return `${root}/${relative}`;
  }

  return (
    <section data-testid="editor-main" className="flex h-full min-h-0 flex-1 flex-col rounded-lg border border-border/80 bg-card shadow-sm">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/80 px-3 text-sm">
        <p className="inline-flex items-center gap-2 font-medium text-foreground">
          <FileCode2 className="size-4 text-muted-foreground" />
          Editor
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
            disabled={!activeTab?.isDirty || activeTabIsImage}
            onClick={() => void saveActiveEditorTab()}
            title="Save (Ctrl S)"
          >
            <Save className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
            disabled={!activeTab?.originalContent || activeTabIsImage}
            onClick={toggleEditorDiffMode}
            title={layout.editorDiffMode ? "Back to Edit" : "View Diff"}
          >
            {layout.editorDiffMode ? <PenLine className="size-4" /> : <Columns2 className="size-4" />}
          </Button>
          {showDiffDisplayControls ? (
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant={settings.diffViewMode === "unified" ? "secondary" : "ghost"}
                className="rounded-sm"
                onClick={() => updateSettings({ patch: { diffViewMode: "unified" } })}
                title="Unified Diff"
              >
                Unified
              </Button>
              <Button
                size="xs"
                variant={settings.diffViewMode === "split" ? "secondary" : "ghost"}
                className="rounded-sm"
                onClick={() => updateSettings({ patch: { diffViewMode: "split" } })}
                title="Split Diff"
              >
                Split
              </Button>
            </div>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
            disabled={!activeTab}
            onClick={() => sendEditorContextToChat({ taskId: activeTaskId })}
            title="Send to Agent"
          >
            <Send className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
            onClick={() => setLayout({ patch: { editorVisible: false } })}
            title="Close Editor"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border/80 bg-editor text-editor-foreground shadow-sm">
        {editorTabs.length > 0 && <div
          className="tab-strip-scroll flex items-end gap-0.5 overflow-x-auto border-b border-border/80 bg-transparent pt-px"
          onWheel={(event) => {
            if (event.deltaY !== 0) {
              event.currentTarget.scrollLeft += event.deltaY;
              event.preventDefault();
            }
          }}
        >
          {editorTabs.map((tab) => (
            <ContextMenu key={tab.id} onOpenChange={(open) => { if (open) setActiveEditorTab({ tabId: tab.id }); }}>
              <ContextMenuTrigger asChild>
                <div
                  draggable
                  onDragStart={(event) => handleTabDragStart(event, tab.id)}
                  onDragEnd={() => {
                    setDraggingTabId(null);
                    setDropTargetTabId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggingTabId && draggingTabId !== tab.id) {
                      setDropTargetTabId(tab.id);
                    }
                  }}
                  onDrop={(event) => handleTabDrop(event, tab.id)}
                  className={[
                    "group -mb-px flex shrink-0 items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-sm transition-colors",
                    tab.id === activeEditorTabId
                      ? "border-border/80 border-b-editor bg-editor-tab-active text-editor-foreground"
                      : "border-transparent border-b-border/80 bg-editor-tab text-muted-foreground hover:bg-editor-muted hover:text-editor-foreground",
                    dropTargetTabId === tab.id && draggingTabId && draggingTabId !== tab.id ? "outline outline-1 outline-primary/60" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    className="max-w-56 min-w-0 truncate text-left"
                    title={tab.filePath}
                    onClick={() => setActiveEditorTab({ tabId: tab.id })}
                  >
                    {tab.filePath.split("/").filter(Boolean).at(-1) ?? tab.filePath}
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
                      tab.id === activeEditorTabId ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    ].join(" ")}
                    onClick={() => {
                      requestCloseTab(tab.id);
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => requestCloseTab(tab.id)}>Close</ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    requestCloseTabs({
                      tabIds: editorTabs.filter((t) => t.id !== tab.id).map((t) => t.id),
                      title: "Close Other Tabs",
                      description: "Close all tabs except this tab?",
                    })
                  }
                >
                  Close Others
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    const startIndex = editorTabs.findIndex((t) => t.id === tab.id);
                    const rightTabIds = startIndex >= 0 ? editorTabs.slice(startIndex + 1).map((t) => t.id) : [];
                    requestCloseTabs({
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
                    requestCloseTabs({
                      tabIds: editorTabs.filter((t) => !t.isDirty).map((t) => t.id),
                      title: "Close Saved Tabs",
                      description: "Close all saved tabs?",
                    })
                  }
                >
                  Close Saved
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    requestCloseTabs({
                      tabIds: editorTabs.map((t) => t.id),
                      title: "Close All Tabs",
                      description: "Close all open tabs?",
                    })
                  }
                >
                  Close All
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void copyText(resolveAbsolutePath(tab.filePath))}>
                  Copy Path
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void copyText(tab.filePath)}>
                  Copy Relative Path
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void copyText(tab.filePath.split("/").filter(Boolean).join(" > "))}>
                  Copy Breadcrumbs Path
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>}

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab ? (
            activeTabIsImage ? (
              <div className="flex h-full items-center justify-center overflow-auto bg-editor p-4">
                {activeTab.content ? (
                  <img
                    src={activeTab.content}
                    alt={activeTab.filePath.split("/").filter(Boolean).at(-1) ?? activeTab.filePath}
                    className="max-h-full max-w-full cursor-zoom-in object-contain"
                    title="Click to open full screen"
                    onClick={() => setImagePreviewOpen(true)}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Unable to load image preview.</div>
                )}
              </div>
            ) : layout.editorDiffMode && activeTab.originalContent ? (
              <DiffEditor
                height="100%"
                language={activeTab.language}
                original={activeTab.originalContent}
                modified={activeTab.content}
                beforeMount={configureMonaco}
                originalModelPath={`${activeModelPath ?? "file:///unknown"}?original`}
                modifiedModelPath={`${activeModelPath ?? "file:///unknown"}?modified`}
                theme={monacoTheme}
                options={{
                  readOnly: false,
                  renderSideBySide: settings.diffViewMode === "split",
                  minimap: { enabled: settings.editorMinimap },
                  fontSize: settings.editorFontSize,
                  fontFamily: settings.editorFontFamily,
                  lineNumbers: settings.editorLineNumbers,
                  wordWrap: settings.editorWordWrap ? "on" : "off",
                }}
                onMount={(editor) => {
                  editor.getOriginalEditor().updateOptions({ tabSize: settings.editorTabSize });
                  editor.getModifiedEditor().updateOptions({ tabSize: settings.editorTabSize });
                  editor.getModifiedEditor().onDidChangeModelContent(() => {
                    const value = editor.getModifiedEditor().getValue();
                    updateEditorContent({ tabId: activeTab.id, content: value });
                  });
                }}
              />
            ) : (
              <MonacoEditor
                height="100%"
                language={activeTab.language}
                value={activeTab.content}
                path={activeModelPath}
                beforeMount={configureMonaco}
                onChange={(value) =>
                  updateEditorContent({
                    tabId: activeTab.id,
                    content: value ?? "",
                  })
                }
                theme={monacoTheme}
                options={{
                  minimap: { enabled: settings.editorMinimap },
                  fontSize: settings.editorFontSize,
                  fontFamily: settings.editorFontFamily,
                  lineNumbers: settings.editorLineNumbers,
                  tabSize: settings.editorTabSize,
                  wordWrap: settings.editorWordWrap ? "on" : "off",
                }}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <Empty data-testid="editor-empty-state" className="border-none bg-transparent p-0">
                <EmptyHeader className="gap-3">
                  <EmptyMedia
                    variant="icon"
                    className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
                  >
                    <FileCode2 strokeWidth={1.5} />
                  </EmptyMedia>
                  <div className="flex flex-col gap-1">
                    <EmptyTitle className="text-2xl font-semibold">Open a file</EmptyTitle>
                    <EmptyDescription className="max-w-md text-sm">
                      Open a file from the Explorer or Changes panel to start editing.
                    </EmptyDescription>
                  </div>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>
      </div>
      {imagePreviewOpen && activeTabIsImage && activeTab ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Image full screen preview"
          onClick={() => setImagePreviewOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              setImagePreviewOpen(false);
            }}
          >
            Close
          </button>
          <img
            src={activeTab.content}
            alt={activeTab.filePath.split("/").filter(Boolean).at(-1) ?? activeTab.filePath}
            className="max-h-full max-w-full cursor-zoom-out object-contain"
            title="Click to close full screen"
            onClick={(event) => {
              event.stopPropagation();
              setImagePreviewOpen(false);
            }}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(tabToClose)}
        title="Close Tab Without Saving"
        description={tabToClose ? `Close "${tabToClose.fileName}" without saving changes?` : ""}
        confirmLabel="Close Tab"
        onCancel={() => setTabToClose(null)}
        onConfirm={() => {
          if (!tabToClose) {
            return;
          }
          closeEditorTab({ tabId: tabToClose.id });
          setTabToClose(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(bulkCloseRequest)}
        title={bulkCloseRequest?.title ?? "Close Tabs"}
        description={bulkCloseRequest?.description ?? ""}
        confirmLabel="Close Tabs"
        onCancel={() => setBulkCloseRequest(null)}
        onConfirm={() => {
          if (!bulkCloseRequest) {
            return;
          }
          for (const tabId of bulkCloseRequest.tabIds) {
            closeEditorTab({ tabId });
          }
          setBulkCloseRequest(null);
        }}
      />
    </section>
  );
}

function toMonacoModelPath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return `file:///${normalized}`;
}
