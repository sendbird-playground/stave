import { CheckCircle2, Circle, ExternalLink, GitPullRequest, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import {
  changeWorkspaceInfoCustomFieldType,
  createWorkspaceFigmaResource,
  createWorkspaceInfoCustomField,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceTodoItem,
  isWorkspaceInfoUrl,
  type WorkspaceInfoCustomField,
  type WorkspaceInfoFieldType,
  type WorkspaceInformationState,
  updateWorkspaceInfoSelectFieldOptions,
  WORKSPACE_INFO_FIELD_TYPES,
  WORKSPACE_LINKED_PR_STATUSES,
} from "@/lib/workspace-information";
import { PR_STATUS_VISUAL } from "@/lib/pr-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

function updateItemById<T extends { id: string }>(
  items: T[],
  id: string,
  updater: (item: T) => T,
) {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== id) {
      return item;
    }
    changed = true;
    return updater(item);
  });

  return changed ? nextItems : items;
}

function removeItemById<T extends { id: string }>(items: T[], id: string) {
  const nextItems = items.filter((item) => item.id !== id);
  return nextItems.length === items.length ? items : nextItems;
}

function openExternalUrl(url: string) {
  if (!isWorkspaceInfoUrl(url)) {
    return;
  }
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

function SectionTitle(props: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{props.description}</p>
      </div>
      {props.action}
    </div>
  );
}

function UrlActionButton(props: { url: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 rounded-sm p-0"
      disabled={!isWorkspaceInfoUrl(props.url)}
      onClick={() => openExternalUrl(props.url)}
      aria-label="Open link"
    >
      <ExternalLink className="size-4" />
    </Button>
  );
}

function WorkspaceInformationSummary(props: {
  workspaceName: string;
  workspacePath: string;
  information: WorkspaceInformationState;
}) {
  const totalConnections =
    props.information.jiraIssues.length
    + props.information.figmaResources.length
    + props.information.linkedPullRequests.length;

  return (
    <Card size="sm" className="border border-border/70 bg-background/80">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Workspace Information</CardTitle>
        <CardDescription className="text-xs">
          Keep links, notes, and delivery metadata attached to this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{props.workspaceName}</p>
          <p className="break-all text-xs leading-5 text-muted-foreground">{props.workspacePath}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-sm">
            {props.information.jiraIssues.length} Jira
          </Badge>
          <Badge variant="outline" className="rounded-sm">
            {props.information.figmaResources.length} Figma
          </Badge>
          <Badge variant="outline" className="rounded-sm">
            {props.information.linkedPullRequests.length} PR links
          </Badge>
          <Badge variant="outline" className="rounded-sm">
            {props.information.todos.length} Todos
          </Badge>
          <Badge variant="outline" className="rounded-sm">
            {props.information.customFields.length} Custom fields
          </Badge>
          <Badge variant="secondary" className="rounded-sm">
            {totalConnections} connected items
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function renderCustomFieldInput(args: {
  field: WorkspaceInfoCustomField;
  onFieldChange: (field: WorkspaceInfoCustomField) => void;
}) {
  const { field, onFieldChange } = args;

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          className="min-h-20"
          value={field.value}
          onChange={(event) => onFieldChange({ ...field, value: event.target.value })}
          placeholder="Field value"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={field.value ?? ""}
          onChange={(event) =>
            onFieldChange({
              ...field,
              value: event.target.value.trim() === "" ? null : Number(event.target.value),
            })}
          placeholder="Field value"
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={field.value ? "default" : "outline"}
            className="h-8 rounded-sm"
            onClick={() => onFieldChange({ ...field, value: !field.value })}
          >
            {field.value ? "Enabled" : "Disabled"}
          </Button>
          <p className="text-xs text-muted-foreground">Use boolean fields for workspace-level flags.</p>
        </div>
      );
    case "date":
      return (
        <Input
          type="date"
          value={field.value}
          onChange={(event) => onFieldChange({ ...field, value: event.target.value })}
        />
      );
    case "url":
      return (
        <div className="flex items-center gap-2">
          <Input
            value={field.value}
            onChange={(event) => onFieldChange({ ...field, value: event.target.value })}
            placeholder="https://..."
          />
          <UrlActionButton url={field.value} />
        </div>
      );
    case "single_select":
      return (
        <div className="space-y-2">
          <Input
            value={field.options.join(", ")}
            onChange={(event) =>
              onFieldChange(
                updateWorkspaceInfoSelectFieldOptions({
                  field,
                  rawValue: event.target.value,
                })
              )}
            placeholder="Options, comma-separated"
          />
          <Select
            value={field.value}
            onValueChange={(value) => onFieldChange({ ...field, value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options.length === 0 ? (
                <SelectItem value="">No options</SelectItem>
              ) : (
                field.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      );
    case "text":
    default:
      return (
        <Input
          value={field.value}
          onChange={(event) => onFieldChange({ ...field, value: event.target.value })}
          placeholder="Field value"
        />
      );
  }
}

export function WorkspaceInformationPanel() {
  const [
    activeWorkspaceId,
    workspaces,
    workspacePath,
    workspaceInformation,
    updateWorkspaceInformation,
    isDefaultWorkspace,
    prInfo,
    fetchWorkspacePrStatus,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.workspaces,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "",
    state.workspaceInformation,
    state.updateWorkspaceInformation,
    Boolean(state.workspaceDefaultById[state.activeWorkspaceId]),
    state.workspacePrInfoById[state.activeWorkspaceId] ?? null,
    state.fetchWorkspacePrStatus,
  ] as const));

  const workspaceName = workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? "Workspace";

  useEffect(() => {
    if (!activeWorkspaceId || isDefaultWorkspace) {
      return;
    }
    void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
  }, [activeWorkspaceId, fetchWorkspacePrStatus, isDefaultWorkspace]);

  function patchWorkspaceInformation(
    updater: (current: WorkspaceInformationState) => WorkspaceInformationState,
  ) {
    updateWorkspaceInformation({ updater });
  }

  function patchCustomField(
    fieldId: string,
    updater: (field: WorkspaceInfoCustomField) => WorkspaceInfoCustomField,
  ) {
    patchWorkspaceInformation((current) => ({
      ...current,
      customFields: updateItemById(current.customFields, fieldId, updater),
    }));
  }

  return (
    <div className="space-y-3">
      <WorkspaceInformationSummary
        workspaceName={workspaceName}
        workspacePath={workspacePath || "Workspace path unavailable"}
        information={workspaceInformation}
      />

      <Card size="sm" className="border border-border/70 bg-background/80">
        <CardContent className="space-y-3 pt-4">
          <SectionTitle
            title="Jira Issues"
            description="Track the issues or tickets this workspace is responsible for."
            action={(
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    jiraIssues: [...current.jiraIssues, createWorkspaceJiraIssue()],
                  }))}
              >
                <Plus className="mr-1 size-4" />
                Add
              </Button>
            )}
          />
          {workspaceInformation.jiraIssues.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Jira issues linked yet.</p>
          ) : null}
          <div className="space-y-3">
            {workspaceInformation.jiraIssues.map((issue) => (
              <div key={issue.id} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-2">
                  <Input
                    value={issue.issueKey}
                    onChange={(event) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        jiraIssues: updateItemById(current.jiraIssues, issue.id, (item) => ({
                          ...item,
                          issueKey: event.target.value,
                        })),
                      }))}
                    placeholder="Issue key"
                  />
                  <Input
                    value={issue.status}
                    onChange={(event) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        jiraIssues: updateItemById(current.jiraIssues, issue.id, (item) => ({
                          ...item,
                          status: event.target.value,
                        })),
                      }))}
                    placeholder="Status"
                  />
                  <UrlActionButton url={issue.url} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        jiraIssues: removeItemById(current.jiraIssues, issue.id),
                      }))}
                    aria-label="Remove Jira issue"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Input
                  value={issue.title}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      jiraIssues: updateItemById(current.jiraIssues, issue.id, (item) => ({
                        ...item,
                        title: event.target.value,
                      })),
                    }))}
                  placeholder="Issue title"
                />
                <Input
                  value={issue.url}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      jiraIssues: updateItemById(current.jiraIssues, issue.id, (item) => ({
                        ...item,
                        url: event.target.value,
                      })),
                    }))}
                  placeholder="https://your-jira/browse/ABC-123"
                />
                <Textarea
                  className="min-h-16"
                  value={issue.note}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      jiraIssues: updateItemById(current.jiraIssues, issue.id, (item) => ({
                        ...item,
                        note: event.target.value,
                      })),
                    }))}
                  placeholder="Implementation note"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="border border-border/70 bg-background/80">
        <CardContent className="space-y-3 pt-4">
          <SectionTitle
            title="Figma Designs"
            description="Attach the design file, frame, or prototype relevant to this workspace."
            action={(
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    figmaResources: [...current.figmaResources, createWorkspaceFigmaResource()],
                  }))}
              >
                <Plus className="mr-1 size-4" />
                Add
              </Button>
            )}
          />
          {workspaceInformation.figmaResources.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Figma resources linked yet.</p>
          ) : null}
          <div className="space-y-3">
            {workspaceInformation.figmaResources.map((resource) => (
              <div key={resource.id} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                  <Input
                    value={resource.title}
                    onChange={(event) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        figmaResources: updateItemById(current.figmaResources, resource.id, (item) => ({
                          ...item,
                          title: event.target.value,
                        })),
                      }))}
                    placeholder="Design title"
                  />
                  <UrlActionButton url={resource.url} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        figmaResources: removeItemById(current.figmaResources, resource.id),
                      }))}
                    aria-label="Remove Figma resource"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Input
                  value={resource.url}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      figmaResources: updateItemById(current.figmaResources, resource.id, (item) => ({
                        ...item,
                        url: event.target.value,
                      })),
                    }))}
                  placeholder="https://www.figma.com/..."
                />
                <Input
                  value={resource.nodeId}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      figmaResources: updateItemById(current.figmaResources, resource.id, (item) => ({
                        ...item,
                        nodeId: event.target.value,
                      })),
                    }))}
                  placeholder="Frame or node id"
                />
                <Textarea
                  className="min-h-16"
                  value={resource.note}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      figmaResources: updateItemById(current.figmaResources, resource.id, (item) => ({
                        ...item,
                        note: event.target.value,
                      })),
                    }))}
                  placeholder="Design handoff note"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="border border-border/70 bg-background/80">
        <CardContent className="space-y-3 pt-4">
          <SectionTitle
            title="GitHub PR"
            description="See the live PR for this branch and keep additional linked PRs beside it."
            action={(
              <div className="flex items-center gap-2">
                {!isDefaultWorkspace ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-sm"
                    onClick={() => void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId })}
                  >
                    <RefreshCcw className="mr-1 size-4" />
                    Refresh
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-sm"
                  onClick={() =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      linkedPullRequests: [...current.linkedPullRequests, createWorkspaceLinkedPullRequest()],
                    }))}
                >
                  <Plus className="mr-1 size-4" />
                  Add
                </Button>
              </div>
            )}
          />

          {isDefaultWorkspace ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Default workspaces do not track a branch PR automatically. You can still keep manual PR references below.
            </div>
          ) : prInfo?.pr ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <PrStatusIcon status={prInfo.derived} className="size-4" />
                    <p className="truncate text-sm font-medium text-foreground">
                      #{prInfo.pr.number} {prInfo.pr.title}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {prInfo.pr.headRefName} → {prInfo.pr.baseRefName}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-sm">
                  {PR_STATUS_VISUAL[prInfo.derived].label}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-sm"
                  onClick={() => openExternalUrl(prInfo.pr?.url ?? "")}
                >
                  <GitPullRequest className="mr-1 size-4" />
                  Open on GitHub
                </Button>
                <p className="text-xs text-muted-foreground">Live branch PR synced from GitHub.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
              No live PR was found for this branch. Manual PR references can still be stored below.
            </div>
          )}

          {workspaceInformation.linkedPullRequests.length === 0 ? (
            <p className="text-xs text-muted-foreground">No manual PR links stored yet.</p>
          ) : null}
          <div className="space-y-3">
            {workspaceInformation.linkedPullRequests.map((item) => (
              <div key={item.id} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                  <Input
                    value={item.title}
                    onChange={(event) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        linkedPullRequests: updateItemById(current.linkedPullRequests, item.id, (pullRequest) => ({
                          ...pullRequest,
                          title: event.target.value,
                        })),
                      }))}
                    placeholder="PR title"
                  />
                  <UrlActionButton url={item.url} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        linkedPullRequests: removeItemById(current.linkedPullRequests, item.id),
                      }))}
                    aria-label="Remove linked PR"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Input
                  value={item.url}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      linkedPullRequests: updateItemById(current.linkedPullRequests, item.id, (pullRequest) => ({
                        ...pullRequest,
                        url: event.target.value,
                      })),
                    }))}
                  placeholder="https://github.com/.../pull/123"
                />
                <Select
                  value={item.status}
                  onValueChange={(value) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      linkedPullRequests: updateItemById(current.linkedPullRequests, item.id, (pullRequest) => ({
                        ...pullRequest,
                        status: value as (typeof WORKSPACE_LINKED_PR_STATUSES)[number],
                      })),
                    }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="PR status" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSPACE_LINKED_PR_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  className="min-h-16"
                  value={item.note}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      linkedPullRequests: updateItemById(current.linkedPullRequests, item.id, (pullRequest) => ({
                        ...pullRequest,
                        note: event.target.value,
                      })),
                    }))}
                  placeholder="PR note"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="border border-border/70 bg-background/80">
        <CardContent className="space-y-3 pt-4">
          <SectionTitle
            title="Notes & Todos"
            description="Capture context, next steps, and release notes tied to this workspace."
            action={(
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    todos: [...current.todos, createWorkspaceTodoItem()],
                  }))}
              >
                <Plus className="mr-1 size-4" />
                Add todo
              </Button>
            )}
          />
          <Textarea
            className="min-h-28"
            value={workspaceInformation.notes}
            onChange={(event) =>
              patchWorkspaceInformation((current) => ({
                ...current,
                notes: event.target.value,
              }))}
            placeholder="Workspace note, release context, blockers, or handoff details"
          />
          <div className="space-y-2">
            {workspaceInformation.todos.length === 0 ? (
              <p className="text-xs text-muted-foreground">No todos yet.</p>
            ) : null}
            {workspaceInformation.todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("h-8 w-8 rounded-sm p-0", todo.completed && "text-primary")}
                  onClick={() =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      todos: updateItemById(current.todos, todo.id, (item) => ({
                        ...item,
                        completed: !item.completed,
                      })),
                    }))}
                  aria-label={todo.completed ? "Mark todo incomplete" : "Mark todo complete"}
                >
                  {todo.completed ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                </Button>
                <Input
                  value={todo.text}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      todos: updateItemById(current.todos, todo.id, (item) => ({
                        ...item,
                        text: event.target.value,
                      })),
                    }))}
                  placeholder="Todo item"
                  className={cn(todo.completed && "text-muted-foreground line-through")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                  onClick={() =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      todos: removeItemById(current.todos, todo.id),
                    }))}
                  aria-label="Remove todo"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="border border-border/70 bg-background/80">
        <CardContent className="space-y-3 pt-4">
          <SectionTitle
            title="Custom Fields"
            description="Add structured workspace metadata with text, dates, booleans, links, numbers, or selects."
            action={(
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    customFields: [...current.customFields, createWorkspaceInfoCustomField()],
                  }))}
              >
                <Plus className="mr-1 size-4" />
                Add field
              </Button>
            )}
          />
          {workspaceInformation.customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No custom fields yet.</p>
          ) : null}
          <div className="space-y-3">
            {workspaceInformation.customFields.map((field) => (
              <div key={field.id} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_11rem_auto] gap-2">
                  <Input
                    value={field.label}
                    onChange={(event) =>
                      patchCustomField(field.id, (currentField) => ({
                        ...currentField,
                        label: event.target.value,
                      }))}
                    placeholder="Field label"
                  />
                  <Select
                    value={field.type}
                    onValueChange={(value) =>
                      patchCustomField(field.id, (currentField) =>
                        changeWorkspaceInfoCustomFieldType({
                          field: currentField,
                          type: value as WorkspaceInfoFieldType,
                        }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Field type" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_INFO_FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-sm p-0 text-muted-foreground"
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        customFields: removeItemById(current.customFields, field.id),
                      }))}
                    aria-label="Remove custom field"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {renderCustomFieldInput({
                  field,
                  onFieldChange: (nextField) => patchCustomField(field.id, () => nextField),
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
