import { Copy, File, LoaderCircle, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { SourceControlStatusItem } from "@/lib/source-control-status";
import { cn } from "@/lib/utils";
import { WorkspaceFileIcon } from "./explorer-entry-icon";
import type { SourceControlItemViewModel, SourceControlSection, SourceControlSummary } from "./editor-panel.utils";

function SourceControlActionButton(args: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "destructive" | "success";
}) {
  const toneClassName = args.tone === "destructive"
    ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
    : args.tone === "success"
      ? "text-success hover:bg-success/10 hover:text-success"
      : "text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={args.label}
      title={args.label}
      className={cn("size-6 rounded-sm border border-transparent p-0 transition-colors", toneClassName)}
      disabled={args.disabled}
      onClick={args.onClick}
    >
      {args.icon}
    </Button>
  );
}

function SourceControlRow(args: {
  isScmBusy: boolean;
  item: SourceControlItemViewModel;
  onCopyPath: (path: string) => void;
  onDiscard: (item: SourceControlStatusItem) => void;
  onOpenDiff: (path: string) => void;
  onStage: (item: SourceControlStatusItem) => void;
  onUnstage: (item: SourceControlStatusItem) => void;
}) {
  const statusClassName = args.item.isConflict
    ? "text-destructive"
    : args.item.hasMixedChanges || args.item.hasUnstagedChanges
      ? "text-warning"
      : args.item.hasStagedChanges
        ? "text-success"
        : "text-muted-foreground";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:bg-muted/30 focus-within:bg-muted/30">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => args.onOpenDiff(args.item.item.path)}
          >
            <WorkspaceFileIcon fileName={args.item.fileName} className="h-4 w-[14px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{args.item.fileName}</span>
                {args.item.hasMixedChanges ? (
                  <Badge variant="outline" className="rounded-md px-1.5 text-[10px]">
                    partial
                  </Badge>
                ) : null}
                {args.item.isUntracked ? (
                  <Badge variant="outline" className="rounded-md px-1.5 text-[10px]">
                    new
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {args.item.pathDetail}
              </p>
            </div>
          </button>

          <div className="relative flex h-6 w-[84px] shrink-0 items-center justify-end">
            <span
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-end pr-1 font-mono text-[11px] font-medium transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0",
                statusClassName,
              )}
            >
              {args.item.displayCode}
            </span>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              {args.item.canStage ? (
                <SourceControlActionButton
                  label="Stage"
                  disabled={args.isScmBusy}
                  icon={<Plus className="size-3.5" />}
                  onClick={() => args.onStage(args.item.item)}
                  tone="success"
                />
              ) : null}
              {args.item.canUnstage ? (
                <SourceControlActionButton
                  label="Unstage"
                  disabled={args.isScmBusy}
                  icon={<Minus className="size-3.5" />}
                  onClick={() => args.onUnstage(args.item.item)}
                  tone="default"
                />
              ) : null}
              {args.item.canDiscard ? (
                <SourceControlActionButton
                  label="Discard"
                  disabled={args.isScmBusy}
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => args.onDiscard(args.item.item)}
                  tone="destructive"
                />
              ) : null}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => args.onOpenDiff(args.item.item.path)}>
          <File className="size-4" />
          Open Changes
        </ContextMenuItem>
        {(args.item.canStage || args.item.canUnstage || args.item.canDiscard) ? <ContextMenuSeparator /> : null}
        {args.item.canStage ? (
          <ContextMenuItem disabled={args.isScmBusy} onSelect={() => args.onStage(args.item.item)}>
            <Plus className="size-4" />
            Stage
          </ContextMenuItem>
        ) : null}
        {args.item.canUnstage ? (
          <ContextMenuItem disabled={args.isScmBusy} onSelect={() => args.onUnstage(args.item.item)}>
            <Minus className="size-4" />
            Unstage
          </ContextMenuItem>
        ) : null}
        {args.item.canDiscard ? (
          <ContextMenuItem
            variant="destructive"
            disabled={args.isScmBusy}
            onSelect={() => args.onDiscard(args.item.item)}
          >
            <RotateCcw className="size-4" />
            Discard
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => args.onCopyPath(args.item.pathLabel)}>
          <Copy className="size-4" />
          Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function WorkspaceChangesPanel(props: {
  sourceBranch: string;
  filteredScmItems: SourceControlStatusItem[];
  sourceControlSummary: SourceControlSummary;
  sourceControlHint: string;
  isScmBusy: boolean;
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  canCommitStagedChanges: boolean;
  canUnstageAnyChanges: boolean;
  onCommit: () => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  hasConflicts: boolean;
  sourceError: string;
  sourceControlSections: SourceControlSection[];
  onCopySourceControlPath: (path: string) => Promise<void>;
  onSelectDiff: (path: string) => Promise<void>;
  onStageAction: (args: { action: "stage" | "unstage"; item: SourceControlStatusItem }) => Promise<void>;
  onDiscardChange: (item: SourceControlStatusItem) => Promise<void>;
  sourceHistory: Array<{ hash: string; relativeDate: string; subject: string }>;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="overflow-auto border-b border-border/80 p-2">
        <div className="space-y-2">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="h-6 max-w-full justify-start gap-1 rounded-md border-border/70 bg-background/80 px-2 font-normal">
                    <RotateCw className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{props.sourceBranch}</span>
                  </Badge>
                  <Badge variant={props.filteredScmItems.length > 0 ? "secondary" : "outline"} className="h-6 rounded-md px-2 font-normal">
                    Changes {props.filteredScmItems.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {props.sourceControlSummary.stagedCount > 0 ? (
                    <Badge variant="success" className="rounded-md px-2 font-normal">
                      Staged {props.sourceControlSummary.stagedCount}
                    </Badge>
                  ) : null}
                  {props.sourceControlSummary.unstagedCount > 0 ? (
                    <Badge variant="warning" className="rounded-md px-2 font-normal">
                      Working Tree {props.sourceControlSummary.unstagedCount}
                    </Badge>
                  ) : null}
                  {props.sourceControlSummary.untrackedCount > 0 ? (
                    <Badge variant="outline" className="rounded-md px-2 font-normal">
                      Untracked {props.sourceControlSummary.untrackedCount}
                    </Badge>
                  ) : null}
                  {props.sourceControlSummary.conflictCount > 0 ? (
                    <Badge variant="destructive" className="rounded-md px-2 font-normal">
                      Conflicts {props.sourceControlSummary.conflictCount}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{props.sourceControlHint}</p>
              </div>
              {props.isScmBusy ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/80 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Commit Staged Changes
            </p>
            <Input
              className="mt-2 h-9 rounded-md border-border/70 bg-background px-2 text-sm"
              placeholder={`Message for "${props.sourceBranch}"`}
              value={props.commitMessage}
              onChange={(event) => props.onCommitMessageChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && props.commitMessage.trim() && props.canCommitStagedChanges && !props.isScmBusy) {
                  event.preventDefault();
                  void props.onCommit();
                }
              }}
              disabled={props.isScmBusy}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-8 min-w-[112px] flex-1 rounded-md text-sm"
                disabled={props.isScmBusy || !props.commitMessage.trim() || !props.canCommitStagedChanges}
                onClick={() => void props.onCommit()}
              >
                Commit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-md text-sm"
                disabled={props.isScmBusy || props.filteredScmItems.length === 0}
                onClick={() => void props.onStageAll()}
              >
                Stage All
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-md text-sm"
                disabled={props.isScmBusy || !props.canUnstageAnyChanges}
                onClick={() => void props.onUnstageAll()}
              >
                Unstage All
              </Button>
            </div>
          </div>

          <div className="space-y-3 px-1">
            {props.hasConflicts ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning dark:bg-warning/15">
                Conflict detected. Resolve, stage, or discard the affected files before committing.
              </div>
            ) : null}
            {props.sourceError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {props.sourceError}
              </div>
            ) : null}
            {!props.sourceError && props.filteredScmItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-4">
                <p className="text-sm font-medium">No local changes.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This workspace matches the checked-out branch.
                </p>
              </div>
            ) : null}
            {props.sourceControlSections.map((section) => (
              <section key={section.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {section.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                  <Badge variant={section.badgeVariant} className="mt-0.5 rounded-md px-2 font-normal">
                    {section.items.length}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {section.items.map((item) => (
                    <SourceControlRow
                      key={`${item.displayCode}:${item.pathLabel}`}
                      item={item}
                      isScmBusy={props.isScmBusy}
                      onCopyPath={(path) => void props.onCopySourceControlPath(path)}
                      onOpenDiff={(path) => void props.onSelectDiff(path)}
                      onStage={(sourceItem) => void props.onStageAction({ action: "stage", item: sourceItem })}
                      onUnstage={(sourceItem) => void props.onStageAction({ action: "unstage", item: sourceItem })}
                      onDiscard={(sourceItem) => void props.onDiscardChange(sourceItem)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/80 p-2">
        <p className="text-sm text-muted-foreground">Commit History ({props.sourceHistory.length})</p>
        <div className="mt-2 max-h-32 space-y-1.5 overflow-auto">
          {props.sourceHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3">
              <p className="text-sm text-muted-foreground">Initial commit</p>
            </div>
          ) : null}
          {props.sourceHistory.map((item) => (
            <div key={`${item.hash}:${item.subject}`} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
              <p className="truncate text-sm font-medium">{item.subject}</p>
              <p className="text-xs text-muted-foreground">{item.hash} · {item.relativeDate}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
