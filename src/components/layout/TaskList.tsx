import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, CirclePlus, Copy, GripVertical, PanelLeft, Plus, RectangleEllipsis } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { CompactTaskItem, TaskItem, type TaskItemProps } from "@/components/layout/TaskItem";
import { Badge, Button, Card, Input, Kbd, KbdGroup, KbdSeparator } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { getProviderConversationLabel, listProviderConversations } from "@/lib/providers/provider-conversations";
import { formatTaskUpdatedAt, getTaskCounts, getVisibleTasks, isTaskArchived, type TaskFilter } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TASK_LIST_MIN_WIDTH, useAppStore } from "@/store/app.store";

const TASK_SHORTCUT_COUNT = 10;

interface SortableTaskRowProps extends TaskItemProps {
  disabled?: boolean;
}

function SortableTaskRow({ disabled = false, ...props }: SortableTaskRowProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-pan-y", isDragging && "z-10 opacity-80")}
    >
      <TaskItem
        {...props}
        dragHandle={(
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`reorder-task-${props.task.id}`}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors",
              disabled
                ? "cursor-default opacity-40"
                : "cursor-grab hover:border-border/80 hover:bg-card/90 hover:text-foreground active:cursor-grabbing"
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
      />
    </div>
  );
}

export function TaskList() {
  const [taskHoverOpen, setTaskHoverOpen] = useState(false);
  const [switchingTaskId, setSwitchingTaskId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("active");
  const [taskToArchive, setTaskToArchive] = useState<{ id: string; title: string } | null>(null);
  const [taskToRename, setTaskToRename] = useState<{ id: string; title: string } | null>(null);
  const [taskToViewSession, setTaskToViewSession] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedSessionIdKey, setCopiedSessionIdKey] = useState<string | null>(null);
  const [timeAnchor, setTimeAnchor] = useState(() => Date.now());
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const tasks = useAppStore((state) => state.tasks);
  const collapsed = useAppStore((state) => state.layout.taskListCollapsed);
  const taskListWidth = useAppStore((state) => state.layout.taskListWidth);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const selectTask = useAppStore((state) => state.selectTask);
  const archiveTask = useAppStore((state) => state.archiveTask);
  const renameTask = useAppStore((state) => state.renameTask);
  const exportTask = useAppStore((state) => state.exportTask);
  const createTask = useAppStore((state) => state.createTask);
  const reorderTasks = useAppStore((state) => state.reorderTasks);
  const setLayout = useAppStore((state) => state.setLayout);
  const resolvedTaskListWidth = Math.max(taskListWidth, TASK_LIST_MIN_WIDTH);

  const taskCounts = useMemo(() => getTaskCounts({ tasks }), [tasks]);
  const visibleTasks = useMemo(() => getVisibleTasks({ tasks, filter: taskFilter }), [taskFilter, tasks]);
  const shortcutModifierLabel =
    typeof navigator !== "undefined" && /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
      ? "⌘"
      : "Ctrl";
  const taskShortcutsEnabled = taskFilter === "active";
  const taskReorderingEnabled = visibleTasks.length > 1;
  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
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
    // Use a small delay so focus is applied after Radix DropdownMenu
    // finishes restoring focus to the trigger element on close.
    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [taskToRename]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setTimeAnchor(Date.now());
    }, 60_000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!taskToViewSession || !copiedSessionIdKey) {
      return;
    }
    const handle = window.setTimeout(() => setCopiedSessionIdKey(null), 1500);
    return () => window.clearTimeout(handle);
  }, [copiedSessionIdKey, taskToViewSession]);

  const sessionTask = taskToViewSession
    ? tasks.find((task) => task.id === taskToViewSession.id) ?? null
    : null;
  const sessionProviderConversations = useAppStore((state) =>
    taskToViewSession ? state.providerConversationByTask[taskToViewSession.id] : undefined
  );
  const sessionConversationRows = listProviderConversations({
    conversations: sessionProviderConversations,
  });

  function handleTaskSelection(taskId: string) {
    if (taskId === activeTaskId || switchingTaskId) {
      return;
    }
    setSwitchingTaskId(taskId);
    selectTask({ taskId });
    window.setTimeout(() => setSwitchingTaskId(null), 120);
  }

  function getTaskShortcutLabel(index: number) {
    if (index < 0 || index >= TASK_SHORTCUT_COUNT) {
      return null;
    }
    return index === TASK_SHORTCUT_COUNT - 1 ? "0" : String(index + 1);
  }

  async function copySessionIdentifier(args: { key: string; value: string }) {
    try {
      await copyTextToClipboard(args.value);
      setCopiedSessionIdKey(args.key);
    } catch {
      setCopiedSessionIdKey(null);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!taskShortcutsEnabled || !hasMod || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement
        && (
          target.isContentEditable
          || (
            Boolean(target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']"))
            && !target.closest("[data-prompt-input-root]")
          )
        )
      ) {
        return;
      }

      const shortcutIndex = event.key === "0"
        ? TASK_SHORTCUT_COUNT - 1
        : Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(shortcutIndex) || shortcutIndex < 0 || shortcutIndex >= TASK_SHORTCUT_COUNT) {
        return;
      }

      const nextTask = visibleTasks[shortcutIndex];
      if (!nextTask) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleTaskSelection(nextTask.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTaskId, taskShortcutsEnabled, switchingTaskId, visibleTasks]);

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

  function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    reorderTasks({
      activeTaskId: String(active.id),
      overTaskId: String(over.id),
      filter: taskFilter,
    });
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
                  {visibleTasks.map((task, index) => (
                    <CompactTaskItem
                      key={task.id}
                      task={task}
                      shortcutLabel={taskShortcutsEnabled ? getTaskShortcutLabel(index) : null}
                      isActive={task.id === activeTaskId}
                      isSwitching={switchingTaskId === task.id}
                      timeAnchor={timeAnchor}
                      onSelect={() => handleTaskSelection(task.id)}
                    />
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
        className="hidden h-full shrink-0 px-3.5 lg:flex lg:flex-col"
        style={{ width: `${resolvedTaskListWidth}px`, minWidth: `${TASK_LIST_MIN_WIDTH}px` }}
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
            <KbdGroup aria-label={`Keyboard shortcut ${shortcutModifierLabel} N`}>
              <Kbd>{shortcutModifierLabel}</Kbd>
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
        {taskShortcutsEnabled ? (
          <div className="mb-3 flex items-center justify-between rounded-md border border-border/60 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
            <span>Quick jump</span>
            <KbdGroup aria-label={`Keyboard shortcut ${shortcutModifierLabel} 1 through 9 and 0`}>
              <Kbd>{shortcutModifierLabel}</Kbd>
              <KbdSeparator>+</KbdSeparator>
              <Kbd>1</Kbd>
              <KbdSeparator>...</KbdSeparator>
              <Kbd>0</Kbd>
            </KbdGroup>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-card/50 px-3 py-4 text-sm text-muted-foreground">
              {taskFilter === "active" ? "No active tasks. Archived tasks are still available in the archived view." : null}
              {taskFilter === "archived" ? "No archived tasks yet." : null}
              {taskFilter === "all" ? "No tasks yet." : null}
            </div>
          ) : (
            <DndContext sensors={taskSensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
              <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {visibleTasks.map((task, index) => (
                    <SortableTaskRow
                      key={task.id}
                      disabled={!taskReorderingEnabled}
                      task={task}
                      shortcutLabel={taskShortcutsEnabled ? getTaskShortcutLabel(index) : null}
                      isActive={task.id === activeTaskId}
                      isSwitching={switchingTaskId === task.id}
                      timeAnchor={timeAnchor}
                      onSelect={() => handleTaskSelection(task.id)}
                      onRename={() => setTaskToRename({ id: task.id, title: task.title })}
                      onArchive={() => setTaskToArchive({ id: task.id, title: task.title })}
                      onExport={() => exportTask({ taskId: task.id })}
                      onViewSession={() => {
                        setCopiedSessionIdKey(null);
                        setTaskToViewSession({ id: task.id, title: task.title });
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
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
                <h3 className="text-base font-semibold text-foreground">Conversation IDs</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Stave keeps its own stable task id, and each provider keeps its own native conversation id.
                  For <span className="font-medium text-foreground">{taskToViewSession.title}</span>, these ids can coexist because one task can switch between providers over time.
                  Provider-native ids are what Stave uses for in-app resume. They may not be resumable from an external Claude or Codex terminal session.
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {sessionTask?.provider ? `Current: ${getProviderLabel({ providerId: sessionTask.provider })}` : "Task"}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border/80 bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stave task ID</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{taskToViewSession.id}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 px-2"
                    onClick={() => void copySessionIdentifier({ key: "task", value: taskToViewSession.id })}
                  >
                    {copiedSessionIdKey === "task" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedSessionIdKey === "task" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              {sessionConversationRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  No provider-native conversation ids have been recorded for this task yet.
                </div>
              ) : (
                sessionConversationRows.map((row) => (
                  <div key={row.providerId} className="rounded-md border border-border/80 bg-background px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {getProviderConversationLabel({ providerId: row.providerId })}
                      </p>
                      <Badge variant={sessionTask?.provider === row.providerId ? "secondary" : "outline"}>
                        {getProviderLabel({ providerId: row.providerId })}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{row.nativeConversationId}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 px-2"
                        onClick={() => void copySessionIdentifier({ key: row.providerId, value: row.nativeConversationId })}
                      >
                        {copiedSessionIdKey === row.providerId ? <Check className="size-4" /> : <Copy className="size-4" />}
                        {copiedSessionIdKey === row.providerId ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTaskToViewSession(null)}>Close</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
