import { Suspense, lazy, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements";
import {
  isPendingDiffStatus,
  summarizeDiffLineChanges,
} from "@/components/session/chat-panel.utils";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { CodeDiffPart, FileContextPart, ImageContextPart } from "@/types/chat";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));

export function toBaseName(filePath: string) {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

const CHAT_DIFF_VIEWER_STYLES = {
  variables: {
    light: {
      diffViewerBackground: "var(--editor)",
      diffViewerTitleBackground: "var(--editor-tab)",
      diffViewerColor: "var(--editor-foreground)",
      diffViewerTitleColor: "var(--editor-foreground)",
      diffViewerTitleBorderColor: "var(--border)",
      addedBackground: "var(--diff-added)",
      addedColor: "var(--diff-added-foreground)",
      removedBackground: "var(--diff-removed)",
      removedColor: "var(--diff-removed-foreground)",
      addedGutterBackground: "var(--diff-added)",
      removedGutterBackground: "var(--diff-removed)",
      gutterBackground: "var(--editor-muted)",
      gutterColor: "var(--muted-foreground)",
      addedGutterColor: "var(--diff-added-foreground)",
      removedGutterColor: "var(--diff-removed-foreground)",
      highlightBackground: "color-mix(in oklch, var(--accent) 14%, transparent)",
      highlightGutterBackground: "color-mix(in oklch, var(--accent) 18%, transparent)",
      codeFoldBackground: "var(--editor-muted)",
      codeFoldGutterBackground: "var(--editor-muted)",
      codeFoldContentColor: "var(--muted-foreground)",
      emptyLineBackground: "var(--editor)",
    },
    dark: {
      diffViewerBackground: "var(--editor)",
      diffViewerTitleBackground: "var(--editor-tab)",
      diffViewerColor: "var(--editor-foreground)",
      diffViewerTitleColor: "var(--editor-foreground)",
      diffViewerTitleBorderColor: "var(--border)",
      addedBackground: "var(--diff-added)",
      addedColor: "var(--diff-added-foreground)",
      removedBackground: "var(--diff-removed)",
      removedColor: "var(--diff-removed-foreground)",
      addedGutterBackground: "var(--diff-added)",
      removedGutterBackground: "var(--diff-removed)",
      gutterBackground: "var(--editor-muted)",
      gutterBackgroundDark: "var(--editor-muted)",
      gutterColor: "var(--muted-foreground)",
      addedGutterColor: "var(--diff-added-foreground)",
      removedGutterColor: "var(--diff-removed-foreground)",
      highlightBackground: "color-mix(in oklch, var(--accent) 14%, transparent)",
      highlightGutterBackground: "color-mix(in oklch, var(--accent) 18%, transparent)",
      codeFoldBackground: "var(--editor-muted)",
      codeFoldGutterBackground: "var(--editor-muted)",
      codeFoldContentColor: "var(--muted-foreground)",
      emptyLineBackground: "var(--editor)",
    },
  },
} as const;

export function toDiffEditorTabId(args: { messageId: string; filePath: string; index: number }) {
  return `chat-diff:${args.messageId}:${args.index}:${args.filePath}`;
}

export function ChangeCount(args: { value: number; tone: "added" | "removed" }) {
  return (
    <span
      className={cn(
        "shrink-0 text-sm font-medium tabular-nums",
        args.tone === "added" ? "text-success" : "text-destructive",
      )}
    >
      {args.tone === "added" ? "+" : "-"}
      {args.value}
    </span>
  );
}

export function ChangedFilesBlock(args: { parts: CodeDiffPart[]; taskId: string; messageId: string; startIndex?: number }) {
  const { parts, taskId, messageId, startIndex = 0 } = args;
  const resolveDiff = useAppStore((state) => state.resolveDiff);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const [openRows, setOpenRows] = useState<number[]>([]);

  const rows = useMemo(() => parts.map((part) => ({
    part,
    summary: summarizeDiffLineChanges({
      oldContent: part.oldContent,
      newContent: part.newContent,
    }),
  })), [parts]);
  const totalAdded = useMemo(() => rows.reduce((sum, row) => sum + row.summary.added, 0), [rows]);
  const totalRemoved = useMemo(() => rows.reduce((sum, row) => sum + row.summary.removed, 0), [rows]);
  const pendingCount = useMemo(() => parts.filter((part) => isPendingDiffStatus(part.status)).length, [parts]);

  function toggleRow(index: number) {
    setOpenRows((current) => (
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
    ));
  }

  function openDiff(args: { part: CodeDiffPart; index: number }) {
    openDiffInEditor({
      editorTabId: toDiffEditorTabId({
        messageId,
        filePath: args.part.filePath,
        index: startIndex + args.index,
      }),
      filePath: args.part.filePath,
      oldContent: args.part.oldContent,
      newContent: args.part.newContent,
    });
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
            {parts.length} {parts.length === 1 ? "file" : "files"} edited
          </span>
          <ChangeCount value={totalAdded} tone="added" />
          <ChangeCount value={totalRemoved} tone="removed" />
          {pendingCount > 0 ? <Badge variant="destructive">{pendingCount} pending</Badge> : null}
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            rows.forEach((row, index) => {
              openDiff({ part: row.part, index });
            });
          }}
        >
          Open All
        </Button>
      </div>
      <div className="divide-y">
        {rows.map((row, index) => {
          const isOpen = openRows.includes(index);
          const isPendingDiff = isPendingDiffStatus(row.part.status);
          return (
            <div key={`${row.part.filePath}-${index}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
                onClick={() => toggleRow(index)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{row.part.filePath}</span>
                <ChangeCount value={row.summary.added} tone="added" />
                <ChangeCount value={row.summary.removed} tone="removed" />
                {isPendingDiff ? <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" /> : null}
                {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
              {isOpen ? (
                <div className="border-t bg-card/40">
                  <div className="overflow-x-auto">
                    <Suspense fallback={<div className="px-3 py-2 text-sm text-muted-foreground">Loading diff...</div>}>
                      <ReactDiffViewer
                        oldValue={row.part.oldContent}
                        newValue={row.part.newContent}
                        splitView={false}
                        hideLineNumbers={false}
                        useDarkTheme={isDarkMode}
                        styles={CHAT_DIFF_VIEWER_STYLES}
                      />
                    </Suspense>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => openDiff({ part: row.part, index })}>
                      Open in Editor
                    </Button>
                    {isPendingDiff ? (
                      <>
                        <Button size="sm" onClick={() => resolveDiff({ taskId, messageId, accepted: true, partIndex: startIndex + index })}>Accept</Button>
                        <Button size="sm" variant="outline" onClick={() => resolveDiff({ taskId, messageId, accepted: false, partIndex: startIndex + index })}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ReferencedFilesBlock(args: { parts: FileContextPart[] }) {
  const { parts } = args;
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const [openRows, setOpenRows] = useState<number[]>([]);

  function toggleRow(index: number) {
    setOpenRows((current) => (
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
    ));
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
            {parts.length} {parts.length === 1 ? "referenced file" : "referenced files"}
          </span>
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            const firstPath = parts[0]?.filePath;
            if (!firstPath) {
              return;
            }
            void openFileFromTree({ filePath: firstPath });
          }}
          disabled={parts.length === 0}
        >
          Open
        </Button>
      </div>
      <div className="divide-y">
        {parts.map((part, index) => {
          const isOpen = openRows.includes(index);
          return (
            <div key={`${part.filePath}-${index}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
                onClick={() => toggleRow(index)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{part.filePath}</span>
                <Badge variant="outline" className="shrink-0">
                  {part.language || toBaseName(part.filePath)}
                </Badge>
                {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
              {isOpen ? (
                <div className="border-t bg-card/40">
                  <CodeBlock code={part.content} language={part.language} className="m-0 rounded-none border-0 border-b">
                    <CodeBlockHeader className="border-b-border/70">
                      <CodeBlockTitle>{part.language || toBaseName(part.filePath)}</CodeBlockTitle>
                      <CodeBlockActions>
                        <CodeBlockCopyButton />
                      </CodeBlockActions>
                    </CodeBlockHeader>
                  </CodeBlock>
                  {part.instruction ? (
                    <div className="border-t px-3 py-2 text-sm text-muted-foreground">{part.instruction}</div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => void openFileFromTree({ filePath: part.filePath })}>
                      Open in Editor
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ImageAttachmentBlock(args: { parts: ImageContextPart[] }) {
  const [previewSrc, setPreviewSrc] = useState<{ dataUrl: string; label: string } | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {args.parts.map((part, index) => (
          <div key={index} className="overflow-hidden rounded-md border border-border/80">
            <img
              src={part.dataUrl}
              alt={part.label}
              className="max-h-48 cursor-zoom-in object-contain"
              title="Click to view full size"
              onClick={() => setPreviewSrc({ dataUrl: part.dataUrl, label: part.label })}
            />
            <p className="border-t border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">{part.label}</p>
          </div>
        ))}
      </div>
      {previewSrc ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Image full screen preview"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewSrc(null);
            }}
          >
            Close
          </button>
          <img
            src={previewSrc.dataUrl}
            alt={previewSrc.label}
            className="max-h-full max-w-full cursor-zoom-out object-contain"
            title="Click to close"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewSrc(null);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
