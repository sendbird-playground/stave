import { Archive, Check, CirclePlus, Copy, Download, Ellipsis, Hash, LoaderCircle, PanelLeft, Pencil, Plus, RectangleEllipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatTaskUpdatedAt, getTaskCounts, getVisibleTasks, isTaskArchived, type TaskFilter } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Kbd, KbdGroup, KbdSeparator, WaveIndicator } from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { ModelIcon } from "@/components/ai-elements";

export function TaskList() {
  const [taskHoverOpen, setTaskHoverOpen] = useState(false);
  const [switchingTaskId, setSwitchingTaskId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("active");
  const [taskToArchive, setTaskToArchive] = useState<{ id: string; title: string } | null>(null);
  const [taskToRename, setTaskToRename] = useState<{ id: string; title: string } | null>(null);
  const [taskToViewSession, setTaskToViewSession] = useState<{ id: string; title: string; provider: "claude-code" | "codex" } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [timeAnchor, setTimeAnchor] = useState(() => Date.now());
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const tasks = useAppStore((state) => state.tasks);
  const layout = useAppStore((state) => state.layout);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeTurnIdsByTask = useAppStore((state) => state.activeTurnIdsByTask);
  const selectTask = useAppStore((state) => state.selectTask);
  const archiveTask = useAppStore((state) => state.archiveTask);
  const renameTask = useAppStore((state) => state.renameTask);
  const exportTask = useAppStore((state) => state.exportTask);
  const createTask = useAppStore((state) => state.createTask);
  const setLayout = useAppStore((state) => state.setLayout);

  const collapsed = layout.taskListCollapsed;
  const taskCounts = getTaskCounts({ tasks });
  const visibleTasks = getVisibleTasks({ tasks, filter: taskFilter });
  const filterOptions: Array<{ id: TaskFilter; label: string; count: number }> = [
    { id: "active", label: "Active", count: taskCounts.active },
    { id: "archived", label: "Archived", count: taskCounts.archived },
    { id: "all", label: "All", count: taskCounts.all },
  ];

  useEffect(() => {
    if (!taskToRename) {
      return;
    }
    setRenameValue(taskToRename.title);
    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [taskToRename]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setTimeAnchor(Date.now());
    }, 60_000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!taskToViewSession || !copiedSessionId) {
      return;
    }
    const handle = window.setTimeout(() => setCopiedSessionId(false), 1500);
    return () => window.clearTimeout(handle);
  }, [copiedSessionId, taskToViewSession]);

  function handleRenameConfirm() {
    if (!taskToRename) {
      return;
    }
    const nextTitle = renameValue.trim();
    if (!nextTitle || nextTitle === taskToRename.title) {
      setTaskToRename(null);
      setRenameValue("");
      return;
    }
    renameTask({ taskId: taskToRename.id, title: nextTitle });
    setTaskToRename(null);
    setRenameValue("");
  }

  if (collapsed) {
    return (
      <aside
        data-testid="task-list"
        className="hidden h-full w-11 shrink-0 lg:flex lg:flex-col"
      >
        <div className="relative flex w-full flex-1 flex-col items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            aria-label="new-task"
            onClick={() => createTask({ title: "" })}
          >
            <Plus className="size-4" />
          </Button>
          <div
            className="relative"
            onMouseEnter={() => setTaskHoverOpen(true)}
            onMouseLeave={() => setTaskHoverOpen(false)}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              aria-label="task-list-hover"
            >
              <RectangleEllipsis className="size-4" />
            </Button>
            {taskHoverOpen ? (
              <div className="absolute left-8 top-0 z-40 w-56 rounded-sm border border-border/80 bg-card p-2 shadow-lg">
                <p className="mb-2 text-sm text-muted-foreground">Tasks</p>
                <div className="mb-2 flex gap-1">
                  {filterOptions.map((option) => (
                    <button
                      key={option.id}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs transition-colors",
                        taskFilter === option.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                      )}
                      onClick={() => setTaskFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-72 space-y-1 overflow-auto">
                  {visibleTasks.map((task) => (
                    <button
                      key={task.id}
                      className={[
                        "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary/70",
                        task.id === activeTaskId ? "bg-secondary/70" : "",
                      ].join(" ")}
                      onClick={() => {
                        if (switchingTaskId || task.id === activeTaskId) {
                          return;
                        }
                        setSwitchingTaskId(task.id);
                        selectTask({ taskId: task.id });
                        window.setTimeout(() => setSwitchingTaskId(null), 120);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate">{task.title}</p>
                        {activeTurnIdsByTask[task.id] ? (
                          <WaveIndicator
                            className={cn("gap-px", task.provider === "claude-code" ? "text-provider-claude" : "text-provider-codex")}
                            barClassName="h-3 w-0.5 rounded-[2px]"
                          />
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isTaskArchived(task) ? "Archived" : formatTaskUpdatedAt({ value: task.updatedAt, now: timeAnchor })}
                      </p>
                    </button>
                  ))}
                  {visibleTasks.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border/70 px-2 py-3 text-xs text-muted-foreground">
                      No {taskFilter} tasks yet.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex justify-start border-t border-border/70 px-1 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            aria-label="expand-task-list"
            onClick={() => setLayout({ patch: { taskListCollapsed: false } })}
          >
            <PanelLeft className="size-3.5" />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <>
    <aside
      data-testid="task-list"
      className="hidden h-full shrink-0 px-2 lg:flex lg:flex-col"
      style={{ width: `${layout.taskListWidth}px`, minWidth: "160px" }}
    >
      <div className="mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 w-full justify-between rounded-md border border-border bg-card px-3.5 text-sm font-semibold text-foreground shadow-sm hover:border-border/90 hover:bg-secondary/70"
          aria-label="new-task"
          onClick={() => createTask({ title: "" })}
        >
          <span className="inline-flex items-center gap-2">
            <CirclePlus className="size-4 text-muted-foreground" />
            New Task
          </span>
          <KbdGroup aria-label="Keyboard shortcut Ctrl N">
            <Kbd>Ctrl</Kbd>
            <KbdSeparator>+</KbdSeparator>
            <Kbd>N</Kbd>
          </KbdGroup>
        </Button>
      </div>
      <div className="mb-3 flex rounded-md border border-border/70 bg-card/70 p-1">
        {filterOptions.map((option) => (
          <button
            key={option.id}
            className={cn(
              "flex-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
              taskFilter === option.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            )}
            onClick={() => setTaskFilter(option.id)}
          >
            {option.label} {option.count}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {visibleTasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "relative rounded-sm border transition-colors",
              task.id === activeTaskId
                ? "border-primary/50 bg-card shadow-sm ring-1 ring-primary/20 hover:border-primary/60 hover:bg-card hover:ring-primary/30 dark:bg-secondary/80 dark:hover:bg-secondary/90"
                : "border-border/70 bg-secondary/50 hover:border-border/90 hover:bg-card/80 hover:ring-1 hover:ring-border/50 dark:bg-card dark:hover:bg-secondary/30"
            )}
          >
            <div className="flex items-start gap-2 px-3 py-2">
              <button
                onClick={() => selectTask({ taskId: task.id })}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Badge variant="secondary" className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-sm">
                      <ModelIcon providerId={task.provider} className="size-3.5" />
                      {task.provider === "claude-code" ? "Claude" : "Codex"}
                    </Badge>
                    {switchingTaskId === task.id ? <LoaderCircle className="size-3 shrink-0 animate-spin text-primary" /> : null}
                    {switchingTaskId !== task.id && activeTurnIdsByTask[task.id] ? (
                      <Badge
                        variant="outline"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border-border/70 bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <WaveIndicator
                          className={cn("gap-px", task.provider === "claude-code" ? "text-provider-claude" : "text-provider-codex")}
                          barClassName="h-3 w-0.5 rounded-[2px]"
                        />
                        Responding
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                  {task.unread ? <span className="inline-block size-1.5 shrink-0 rounded-full bg-warning" /> : null}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <p>{formatTaskUpdatedAt({ value: task.updatedAt, now: timeAnchor })}</p>
                  {isTaskArchived(task) ? (
                    <Badge variant="outline" className="rounded-md border-border/70 px-1.5 py-0 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      Archived
                    </Badge>
                  ) : null}
                </div>
              </button>
              <div className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 rounded-md border border-transparent p-0 text-muted-foreground hover:border-border/80 hover:bg-card/90 hover:text-foreground"
                      aria-label={`task-actions-${task.id}`}
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setTaskToRename({ id: task.id, title: task.title })}>
                        <Pencil />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportTask({ taskId: task.id })}>
                        <Download />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setCopiedSessionId(false);
                        setTaskToViewSession({ id: task.id, title: task.title, provider: task.provider });
                      }}>
                        <Hash />
                        View Session ID
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setTaskToArchive({ id: task.id, title: task.title })}>
                        <Archive />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        ))}
        {visibleTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-card/50 px-3 py-4 text-sm text-muted-foreground">
            {taskFilter === "active" ? "No active tasks. Archived tasks are still available in the archived view." : null}
            {taskFilter === "archived" ? "No archived tasks yet." : null}
            {taskFilter === "all" ? "No tasks yet." : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-start border-t border-border/70 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-auto rounded-md border border-border/70 bg-card/80 px-3 text-sm text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground"
          aria-label="collapse-task-list"
          onClick={() => setLayout({ patch: { taskListCollapsed: true } })}
        >
          <PanelLeft className="size-3.5" />
          Collapse
        </Button>
      </div>
    </aside>
    <ConfirmDialog
      open={Boolean(taskToArchive)}
      title="Archive Task"
      description={taskToArchive ? `Archive task "${taskToArchive.title}"? You can still access it from the archived filter.` : ""}
      confirmLabel="Archive"
      onCancel={() => setTaskToArchive(null)}
      onConfirm={() => {
        if (!taskToArchive) {
          return;
        }
        archiveTask({ taskId: taskToArchive.id });
        setTaskToArchive(null);
      }}
    />
    {taskToRename ? (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]" onMouseDown={() => setTaskToRename(null)}>
        <Card className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
          <h3 className="text-base font-semibold text-foreground">Rename Task</h3>
          <p className="mt-2 text-sm text-muted-foreground">Enter a new name for this task.</p>
          <Input
            ref={renameInputRef}
            className="mt-3 h-10 rounded-sm border-border/80 bg-background"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleRenameConfirm();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setTaskToRename(null);
              }
            }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTaskToRename(null)}>Cancel</Button>
            <Button onClick={handleRenameConfirm}>Rename</Button>
          </div>
        </Card>
      </div>
    ) : null}
    {taskToViewSession ? (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]" onMouseDown={() => setTaskToViewSession(null)}>
        <Card className="w-full max-w-lg rounded-lg border-border/80 bg-card p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Session ID</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This is Stave&apos;s task session identifier for <span className="font-medium text-foreground">{taskToViewSession.title}</span>.
                Claude SDK session state and Codex thread state are scoped from this task id inside the provider runtime.
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {taskToViewSession.provider === "claude-code" ? "Claude" : "Codex"}
            </Badge>
          </div>
          <div className="mt-4 rounded-md border border-border/80 bg-background px-3 py-2 font-mono text-sm text-foreground">
            {taskToViewSession.id}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This is not the raw provider-issued id shown by Claude or Codex directly. It is the stable Stave task id those provider sessions attach to.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTaskToViewSession(null)}>Close</Button>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(taskToViewSession.id);
                setCopiedSessionId(true);
              }}
            >
              {copiedSessionId ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiedSessionId ? "Copied" : "Copy ID"}
            </Button>
          </div>
        </Card>
      </div>
    ) : null}
    </>
  );
}
